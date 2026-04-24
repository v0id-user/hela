"""
hela — managed real-time on BEAM. Python SDK.

Typical use::

    from hela import connect

    async with connect(region="iad", token=my_jwt) as client:
        chat = client.channel("chat:lobby")
        await chat.join()

        @chat.on_message
        async def handle(msg):
            print(msg.author, msg.body)

        await chat.publish("hello")

See `docs/sdk/python.md` for the full guide.
"""

# Clean, user-facing re-exports of the generated types. The umbrella
# schema forces the generator to suffix every referenced model with `1`
# (Message1, PublishReply1, …) and emit a RootModel wrapper with the
# clean name. Those RootModel wrappers make callers write
# `reply.root.field`, which nobody wants — so we alias past them and
# hand users the real BaseModel directly.
from hela._generated.wire import (
    HistoryReply1 as HistoryReply,
)
from hela._generated.wire import (
    HistoryRequest1 as HistoryRequest,
)
from hela._generated.wire import (
    JoinReply1 as JoinReply,
)
from hela._generated.wire import (
    JoinRequest1 as JoinRequest,
)
from hela._generated.wire import (
    Message1 as Message,
)
from hela._generated.wire import (
    PresenceDiff1 as PresenceDiff,
)
from hela._generated.wire import (
    PresenceState1 as PresenceState,
)
from hela._generated.wire import (
    PublishReply1 as PublishReply,
)
from hela._generated.wire import (
    PublishRequest1 as PublishRequest,
)
from hela.channel import HelaChannel
from hela.client import HelaClient, connect
from hela.errors import (
    HelaError,
    RateLimitedError,
    TimeoutError,
    UnauthorizedError,
)
from hela.presence import Presence, PresenceEntry

__version__ = "0.1.0"

__all__ = [
    # top-level
    "connect",
    "HelaClient",
    "HelaChannel",
    "Presence",
    "PresenceEntry",
    # types
    "Message",
    "PublishRequest",
    "PublishReply",
    "HistoryRequest",
    "HistoryReply",
    "JoinRequest",
    "JoinReply",
    "PresenceState",
    "PresenceDiff",
    # errors
    "HelaError",
    "RateLimitedError",
    "TimeoutError",
    "UnauthorizedError",
]
