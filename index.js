#!/usr/bin/env node

import { runElixir } from "./src/elixir";
import { runRuby } from "./src/ruby";

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