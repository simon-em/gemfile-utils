defmodule ASTHelper do
  def dump(file_path) do
    content = File.read!(file_path)
    {:ok, quoted} = Code.string_to_quoted(content)
    deps = find_deps_list(quoted)

    if deps do
      IO.puts(encode_json(deps))
    else
      IO.puts("null")
    end
  end

  defp find_deps_list({:defmodule, _, [_, [do: {:__block__, _, blocks}]]}) do
    find_deps_in_blocks(blocks)
  end

  defp find_deps_list({:defmodule, _, [_, [do: block]]}) do
    find_deps_in_blocks([block])
  end

  defp find_deps_in_blocks(blocks) do
    Enum.find_value(blocks, fn
      {:defp, _, [{:deps, _, _}, [do: list]]} -> list
      {:def, _, [{:deps, _, _}, [do: list]]} -> list
      _ -> nil
    end)
  end

  defp encode_json(val) when is_atom(val) do
    cond do
      val === true -> "true"
      val === false -> "false"
      val === nil -> "null"
      true -> "{\":\":\"#{val}\"}"
    end
  end

  defp encode_json(val) when is_binary(val), do: "\"#{val}\""
  defp encode_json(val) when is_number(val), do: "#{val}"

  defp encode_json(val) when is_list(val) do
    "[" <> (Enum.map(val, &encode_json/1) |> Enum.join(",")) <> "]"
  end

  defp encode_json(tuple) when is_tuple(tuple) do
    "{\"{}\":[" <> (Tuple.to_list(tuple) |> Enum.map(&encode_json/1) |> Enum.join(",")) <> "]}"
  end

  def update(file_path, elixir_str) do
    content = File.read!(file_path)
    {new_deps, _} = Code.eval_string(elixir_str)

    {:ok, quoted} = Code.string_to_quoted(content, columns: true, token_metadata: true)
    updated_quoted = update_deps_in_quoted(quoted, new_deps)

    formatted = updated_quoted |> Macro.to_string() |> Code.format_string!()
    File.write!(file_path, formatted)
  end

  defp update_deps_in_quoted({:defmodule, meta, [name, [do: block]]}, new_deps) do
    {:defmodule, meta, [name, [do: update_block(block, new_deps)]]}
  end

  defp update_block({:__block__, meta, blocks}, new_deps) do
    {:__block__, meta, Enum.map(blocks, &update_deps_func(&1, new_deps))}
  end

  defp update_block(block, new_deps) do
    update_deps_func(block, new_deps)
  end

  defp update_deps_func({:defp, meta, [{:deps, m2, a}, [do: _]]}, new_deps) do
    {:defp, meta, [{:deps, m2, a}, [do: new_deps]]}
  end

  defp update_deps_func({:def, meta, [{:deps, m2, a}, [do: _]]}, new_deps) do
    {:def, meta, [{:deps, m2, a}, [do: new_deps]]}
  end

  defp update_deps_func(other, _), do: other
end

case System.argv() do
  ["dump", file] -> ASTHelper.dump(file)
  ["update", file, elixir_str] -> ASTHelper.update(file, elixir_str)
  _ -> IO.puts("Usage: elixir ast_helper.exs [dump|update] file [data]")
end
