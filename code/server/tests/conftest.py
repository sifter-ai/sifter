"""
Shared test configuration.
All async tests use a single session-scoped event loop to avoid
motor event loop conflicts.
"""

import asyncio
import pytest


# Force all tests in this session to use the same event loop
@pytest.fixture(scope="session")
def event_loop():
    policy = asyncio.get_event_loop_policy()
    loop = policy.new_event_loop()
    yield loop
    loop.close()
