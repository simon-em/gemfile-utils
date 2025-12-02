#!/usr/bin/env node

import fs from "fs";
import https from "https";

const MAJOR_VERSION_AGE_THRESHOLD = 180; // 6 months in days

class GemfileUpdater {
  constructor(gemfilePath = "Gemfile") {
    this.gemfilePath = gemfilePath;
    this.gemfileContent = fs.readFileSync(gemfilePath, "utf8");
  }

  async update() {
    const lines = this.gemfileContent.split("\n");
    const updatedLines = [];

    for (const line of lines) {
      if (
        line.trim().startsWith("gem ") &&
        !(line.includes("#") && line.indexOf("#") < line.indexOf("gem"))
      ) {
        const { gemName, currentVersion, hasAltSource } =
          this.parseGemLine(line);

        if (gemName && !hasAltSource) {
          console.log(`Processing: ${gemName}`);

          const latestInfo = await this.fetchLatestVersionInfo(gemName);

          if (latestInfo) {
            const targetVersion = this.determineTargetVersion(
              currentVersion,
              latestInfo.latest,
              latestInfo.majorReleaseDate
            );

            const newLine = this.buildGemLine(line, gemName, targetVersion);
            updatedLines.push(newLine);

            console.log(
              `  ${currentVersion || "unpinned"} -> ~> ${targetVersion}`
            );
          } else {
            updatedLines.push(line);
            console.log(`  ⚠ Skipped (could not fetch version info)`);
          }
        } else {
          if (hasAltSource) {
            console.log(`Skipping: ${gemName} (non-RubyGems source)`);
          }
          updatedLines.push(line);
        }
      } else {
        updatedLines.push(line);
      }
    }

    fs.writeFileSync(this.gemfilePath, updatedLines.join("\n"));
    console.log("\n✓ Gemfile updated successfully!");
  }

  parseGemLine(line) {
    // Check for alternative sources (git, github, path, source)
    const hasAltSource = /\b(git:|github:|path:|source:)/.test(line);

    // Match: gem 'name' or gem "name"
    const match = line.match(/gem\s+['"]([^'"]+)['"]/);
    if (!match) {
      return { gemName: null, currentVersion: null, hasAltSource: false };
    }

    const gemName = match[1];

    // Extract version number from any constraint if present
    let currentVersion = null;
    const versionMatch = line.match(
      /['"],\s*['"]([~>=<]*\s*)?([0-9]+\.[0-9]+(?:\.[0-9]+)?(?:\.[0-9]+)?)['"]/
    );
    if (versionMatch) {
      currentVersion = versionMatch[2];
    }

    return { gemName, currentVersion, hasAltSource };
  }

  fetchLatestVersionInfo(gemName) {
    return new Promise((resolve) => {
      const options = {
        hostname: "rubygems.org",
        port: 443,
        path: `/api/v1/versions/${gemName}.json`,
        method: "GET",
        rejectUnauthorized: false, // Skip SSL verification
        timeout: 10000,
      };

      const req = https.request(options, (res) => {
        let data = "";

        res.on("data", (chunk) => {
          data += chunk;
        });

        res.on("end", () => {
          if (res.statusCode !== 200) {
            console.log(
              `  ⚠ Error fetching info for ${gemName}: HTTP ${res.statusCode}`
            );
            resolve(null);
            return;
          }

          try {
            const versions = JSON.parse(data);

            // Filter out prerelease versions
            const stableVersions = versions.filter((v) => !v.prerelease);
            if (stableVersions.length === 0) {
              resolve(null);
              return;
            }

            const latest = stableVersions[0];
            const latestVersion = latest.number;

            // Find the release date of the current major version
            const majorVersion = parseInt(latestVersion.split(".")[0]);
            const majorVersions = stableVersions.filter(
              (v) => parseInt(v.number.split(".")[0]) === majorVersion
            );

            // Get the oldest release in this major version (first release of major)
            const majorReleaseDate = new Date(
              majorVersions[majorVersions.length - 1].created_at
            );

            resolve({
              latest: latestVersion,
              majorReleaseDate: majorReleaseDate,
            });
          } catch (e) {
            console.log(`  ⚠ Error parsing info for ${gemName}: ${e.message}`);
            resolve(null);
          }
        });
      });

      req.on("error", (e) => {
        console.log(`  ⚠ Error fetching info for ${gemName}: ${e.message}`);
        resolve(null);
      });

      req.on("timeout", () => {
        req.destroy();
        console.log(`  ⚠ Timeout fetching info for ${gemName}`);
        resolve(null);
      });

      req.end();
    });
  }

  determineTargetVersion(currentVersion, latestVersion, majorReleaseDate) {
    const today = new Date();
    const daysSinceMajorRelease = Math.floor(
      (today - majorReleaseDate) / (1000 * 60 * 60 * 24)
    );

    if (!currentVersion) {
      // No pinned version - use latest
      return latestVersion;
    }

    const currentParts = currentVersion.split(".").map((n) => parseInt(n));
    const latestParts = latestVersion.split(".").map((n) => parseInt(n));

    const currentMajor = currentParts[0];
    const latestMajor = latestParts[0];

    // If we're already on the latest major, update to latest version
    if (currentMajor === latestMajor) {
      return latestVersion;
    }

    // Check if latest major version is at least 6 months old
    if (daysSinceMajorRelease >= MAJOR_VERSION_AGE_THRESHOLD) {
      // Update to latest major version
      return latestVersion;
    } else {
      // Stay on current major - in a full implementation, we'd fetch the latest minor
      // For now, return current version
      return currentVersion;
    }
  }

  buildGemLine(originalLine, gemName, version) {
    // Preserve indentation
    const indent = originalLine.match(/^\s*/)[0];

    // Detect quote style
    const quote = originalLine.includes(`'${gemName}'`) ? "'" : '"';

    // Match everything after the gem name
    const afterGemMatch = originalLine.match(
      new RegExp(
        `gem\\s+['"]${gemName.replace(
          /[.*+?^${}()|[\]\\]/g,
          "\\$&"
        )}['"]\\s*(.*)`
      )
    );
    let afterGem = afterGemMatch ? afterGemMatch[1] : "";

    // Remove any existing version constraint
    afterGem = afterGem.replace(/^,\s*['"][^'"]*['"]/, "");

    // Build the new line
    let newLine = `${indent}gem ${quote}${gemName}${quote}, ${quote}~> ${version}${quote}`;

    // Add back any remaining options (like require: false, etc.)
    if (afterGem.trim().length > 0) {
      newLine += afterGem.trimEnd();
    }

    return newLine;
  }
}

// Main execution
async function main() {
  const gemfilePath = process.argv[2] || "Gemfile";

  if (!fs.existsSync(gemfilePath)) {
    console.error(`Error: ${gemfilePath} not found`);
    process.exit(1);
  }

  console.log(`Updating ${gemfilePath}...\n`);
  const updater = new GemfileUpdater(gemfilePath);
  await updater.update();
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
