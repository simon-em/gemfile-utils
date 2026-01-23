#!/usr/bin/env node

import { runElixir } from "./src/elixir.js";
import { runRuby } from "./src/ruby.js";

async function run() {
  if (process.argv[3] == 'mix.exs') {
    return runElixir()
  }

  return runRuby(process.argv[3])
}

run().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});