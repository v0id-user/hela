defmodule HelaWeb.RegionController do
  use HelaWeb, :controller

  # The landing page uses this to populate the region selector.
  @regions [
    %{slug: "iad", city: "Ashburn, US East", host: "iad.hela.dev"},
    %{slug: "sjc", city: "San Jose, US West", host: "sjc.hela.dev"},
    %{slug: "ams", city: "Amsterdam, EU", host: "ams.hela.dev"},
    %{slug: "sin", city: "Singapore, Asia", host: "sin.hela.dev"},
    %{slug: "syd", city: "Sydney, AU", host: "syd.hela.dev"}
  ]

  def index(conn, _) do
    json(conn, %{regions: @regions, you_are_on: Hela.region()})
  end

  def ping(conn, %{"slug" => slug}) do
    # This endpoint lands on whichever region the browser actually opened
    # a WebSocket to — it replies with the region *this node* is running
    # in, and the client measures round-trip. The `slug` is just for the
    # client's log line; we echo it back so it can confirm DNS went where
    # it thought.
    json(conn, %{
      asked_for: slug,
      served_by: Hela.region(),
      node: to_string(node()),
      t: System.system_time(:millisecond)
    })
  end
end
