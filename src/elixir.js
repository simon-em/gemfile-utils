import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';
import semver from 'semver';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const HELPER_PATH = path.join(__dirname, '../scripts/ast_helper.exs');
const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;
const SIX_MONTHS_MS = 180 * 24 * 60 * 60 * 1000;

async function checkElixir() {
    try {
        execSync('elixir --version', { stdio: 'ignore' });
    } catch (e) {
        console.error('Elixir is not available. Please install Elixir to use this tool.');
        process.exit(1);
    }
}

function parseDepsFromAST(ast) {
    return ast.map(item => {
        let name, version, isTuple = false;

        if (item && item["{}"]) {
            const elements = item["{}"];
            if (elements[0] && elements[0][":"]) {
                name = elements[0][":"];
                version = elements[1];
                isTuple = true;
            }
        }

        if (name) {
            return { name, version, raw: item };
        }
        return null;
    }).filter(Boolean);
}

async function getPackageInfo(name) {
    try {
        const response = await axios.get(`https://hex.pm/api/packages/${name}`);
        return response.data;
    } catch (e) {
        // console.warn(`Could not fetch info for ${name}: ${e.message}`);
        return null;
    }
}

function selectBestVersion(currentVersionStr, packageInfo) {
    if (!packageInfo || !packageInfo.releases) return null;

    const releases = packageInfo.releases;
    const now = new Date();

    // Clean current version string (remove ~>, >=, etc.)
    const currentClean = semver.coerce(currentVersionStr);
    if (!currentClean) return null;

    let bestVersion = null;

    for (const release of releases) {
        const ver = release.version;
        // Skip pre-releases unless current is pre-release (standard behavior)
        if (semver.prerelease(ver) && !semver.prerelease(currentClean.version)) continue;

        const insertedAt = new Date(release.inserted_at);

        // rule: version must be more than 14 days old
        if (now - insertedAt < FOURTEEN_DAYS_MS) continue;

        // rule: if major update, major must be more than 6 months old
        if (semver.major(ver) > semver.major(currentClean)) {
            // Find the earliest release of this major
            const firstOfMajor = releases
                .filter(r => semver.major(r.version) === semver.major(ver))
                .sort((a, b) => new Date(a.inserted_at) - new Date(b.inserted_at))[0];

            const firstMajorDate = new Date(firstOfMajor.inserted_at);
            if (now - firstMajorDate < SIX_MONTHS_MS) continue;
        }

        // We want the most recent (highest) version satisfying conditions
        if (!bestVersion || semver.gt(ver, bestVersion)) {
            bestVersion = ver;
        }
    }

    if (bestVersion && semver.gt(bestVersion, currentClean)) {
        return bestVersion;
    }
    return null;
}

function convertToElixir(val) {
    if (val === null) return "nil";
    if (val === true) return "true";
    if (val === false) return "false";
    if (typeof val === "string") return `"${val}"`;
    if (typeof val === "number") return val.toString();
    if (typeof val === "object") {
        if (val[":"]) return `:${val[":"]}`;
        if (val["{}"]) {
            return "{" + val["{}"].map(convertToElixir).join(", ") + "}";
        }
    }
    if (Array.isArray(val)) {
        return "[" + val.map(convertToElixir).join(", ") + "]";
    }
    return val.toString();
}

export async function runElixir() {
    await checkElixir();

    const mixFilePath = 'mix.exs';
    if (!fs.existsSync(mixFilePath)) {
        console.error(`File not found: ${mixFilePath}`);
        process.exit(1);
    }

    const astJson = execSync(`elixir ${HELPER_PATH} dump ${mixFilePath}`, { encoding: 'utf8', stdio: ['inherit', 'pipe', 'inherit'] }).split('\n').filter(l => l.startsWith('[')).pop();
    if (!astJson) {
        console.error('Could not get AST from Elixir');
        process.exit(1);
    }

    const ast = JSON.parse(astJson);
    const deps = parseDepsFromAST(ast);
    const updatedAST = JSON.parse(JSON.stringify(ast));

    let updatesFound = false;
    process.stdout.write(`Checking ${deps.length} dependencies...`);

    for (let i = 0; i < deps.length; i++) {
        const dep = deps[i];
        if (typeof dep.version !== 'string' || !dep.version.match(/[0-9]/)) continue;

        const info = await getPackageInfo(dep.name);
        if (!info) continue;

        const best = selectBestVersion(dep.version, info);

        if (best) {
            console.log(`\nUpdate ${dep.name}: ${dep.version} -> ~> ${best}`);
            updatesFound = true;

            const newVersionStr = `~> ${best}`;

            // Update in AST
            for (let j = 0; j < updatedAST.length; j++) {
                let item = updatedAST[j];
                if (item && item["{}"]) {
                    const elements = item["{}"];
                    if (elements[0] && elements[0][":"] === dep.name) {
                        elements[1] = newVersionStr;
                    }
                }
            }
        } else {
            process.stdout.write('.');
        }
    }
    console.log();

    if (updatesFound) {
        const elixirStr = convertToElixir(updatedAST);
        // Using temporary file for the data to avoid shell escaping issues with long strings
        const dataPath = 'temp_deps.exs';
        fs.writeFileSync(dataPath, elixirStr);
        execSync(`elixir ${HELPER_PATH} update ${mixFilePath} "$(cat ${dataPath})"`);
        fs.unlinkSync(dataPath);
        console.log('mix.exs updated successfully.');
    } else {
        console.log('All dependencies are up to date (given the constraints).');
    }
}

//run().catch(console.error);
