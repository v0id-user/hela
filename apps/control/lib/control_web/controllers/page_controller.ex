defmodule ControlWeb.PageController do
  use ControlWeb, :controller

  def health(conn, _), do: json(conn, %{ok: true})
end
