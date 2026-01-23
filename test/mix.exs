defmodule WwDechets.MixProject do
  use Mix.Project

  def project do
    [
      app: :ww_dechets,
      version: "0.1.0",
      elixir: "~> 1.15",
      elixirc_paths: elixirc_paths(Mix.env()),
      start_permanent: Mix.env() == :prod,
      aliases: aliases(),
      deps: deps(),
      compilers: [:phoenix_live_view] ++ Mix.compilers(),
      listeners: [Phoenix.CodeReloader]
    ]
  end

  def application do
    [mod: {WwDechets.Application, []}, extra_applications: [:logger, :runtime_tools]]
  end

  def cli do
    [preferred_envs: [precommit: :test]]
  end

  defp elixirc_paths(:test) do
    ["lib", "test/support"]
  end

  defp elixirc_paths(_) do
    ["lib"]
  end

  defp deps do
    [
      {:bcrypt_elixir, "~> 3.3.2"},
      {:phoenix, "~> 1.8.3"},
      {:phoenix_ecto, "~> 4.7.0"},
      {:ecto_sql, "~> 3.13.4"},
      {:postgrex, "~> 0.21.1"},
      {:phoenix_html, "~> 4.3.0"},
      {:phoenix_live_reload, "~> 1.2", only: :dev},
      {:phoenix_live_view, "~> 1.1.19"},
      {:lazy_html, ">= 0.1.0", only: :test},
      {:phoenix_live_dashboard, "~> 0.8.7"},
      {:esbuild, "~> 0.10", runtime: Mix.env() == :dev},
      {:tailwind, "~> 0.3", runtime: Mix.env() == :dev},
      heroicons: [
        github: "tailwindlabs/heroicons",
        tag: "v2.2.0",
        sparse: "optimized",
        app: false,
        compile: false,
        depth: 1
      ],
      swoosh: "~> 1.20.0",
      req: "~> 0.5.17",
      telemetry_metrics: "~> 1.1.0",
      telemetry_poller: "~> 1.3.0",
      gettext: "~> 0.26.2",
      jason: "~> 1.4.4",
      dns_cluster: "~> 0.2.0",
      bandit: "~> 1.10.1",
      vix: "~> 0.36.0"
    ]
  end

  defp aliases do
    [
      setup: ["deps.get", "ecto.setup", "assets.setup", "assets.build"],
      "ecto.setup": ["ecto.create", "ecto.migrate", "run priv/repo/seeds.exs"],
      "ecto.reset": ["ecto.drop", "ecto.setup"],
      test: ["ecto.create --quiet", "ecto.migrate --quiet", "test"],
      "assets.setup": ["tailwind.install --if-missing", "esbuild.install --if-missing"],
      "assets.build": ["tailwind ww_dechets", "esbuild ww_dechets"],
      "assets.deploy": [
        "tailwind ww_dechets --minify",
        "esbuild ww_dechets --minify",
        "phx.digest"
      ],
      precommit: ["compile --warning-as-errors", "deps.unlock --unused", "format", "test"],
      "gettext.sync": ["gettext.extract --merge --no-fuzzy"]
    ]
  end
end