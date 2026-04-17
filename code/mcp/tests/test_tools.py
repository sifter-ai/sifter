"""Tests for MCP tool functions — mocks the Sifter SDK client."""

from unittest.mock import MagicMock, patch

import pytest

import sifter_mcp.server as srv


def _make_client(sifts=None, records=None, folders=None, query_result=None):
    client = MagicMock()
    client.list_sifts.return_value = sifts or []
    client.list_folders.return_value = folders or []

    sift_handle = MagicMock()
    sift_handle._data = {"id": "s1", "name": "Test"}
    sift_handle.records.return_value = records or []
    sift_handle.query.return_value = query_result or []
    sift_handle.sifts.return_value = []
    sift_handle.documents.return_value = []
    client.get_sift.return_value = sift_handle

    folder_handle = MagicMock()
    folder_handle.documents.return_value = []
    folder_handle.sifts.return_value = []
    client.get_folder.return_value = folder_handle

    return client


def test_list_sifts():
    mock_client = _make_client(sifts=[{"id": "s1", "name": "Invoices"}])
    with patch.dict("os.environ", {"SIFTER_API_KEY": "sk-test"}):
        with patch("sifter_mcp.server.Sifter", return_value=mock_client):
            srv._env_api_key = "sk-test"
            result = srv.list_sifts()
    assert result == [{"id": "s1", "name": "Invoices"}]
    mock_client.list_sifts.assert_called_once()


def test_list_records():
    mock_records = [{"id": "r1", "extracted_data": {"client": "Acme"}}]
    mock_client = _make_client(records=mock_records)
    with patch("sifter_mcp.server.Sifter", return_value=mock_client):
        srv._env_api_key = "sk-test"
        result = srv.list_records("s1", limit=10, offset=0)
    assert result == mock_records
    mock_client.get_sift.assert_called_once_with("s1")
    mock_client.get_sift.return_value.records.assert_called_once_with(limit=10, offset=0)


def test_list_records_clamps_limit():
    mock_client = _make_client()
    with patch("sifter_mcp.server.Sifter", return_value=mock_client):
        srv._env_api_key = "sk-test"
        srv.list_records("s1", limit=500)
    mock_client.get_sift.return_value.records.assert_called_once_with(limit=100, offset=0)


def test_query_sift():
    mock_result = [{"answer": "Total is $1500"}]
    mock_client = _make_client(query_result=mock_result)
    with patch("sifter_mcp.server.Sifter", return_value=mock_client):
        srv._env_api_key = "sk-test"
        result = srv.query_sift("s1", "What is the total?")
    assert result == mock_result
    mock_client.get_sift.return_value.query.assert_called_once_with("What is the total?")


def test_list_folders():
    mock_folders = [{"id": "f1", "name": "Q1"}]
    mock_client = _make_client(folders=mock_folders)
    with patch("sifter_mcp.server.Sifter", return_value=mock_client):
        srv._env_api_key = "sk-test"
        result = srv.list_folders()
    assert result == mock_folders


def test_missing_api_key_raises():
    srv._env_api_key = ""
    srv._request_api_key.set("")
    with pytest.raises(RuntimeError, match="SIFTER_API_KEY"):
        srv._get_client()


def test_request_api_key_overrides_env():
    """Per-request key (HTTP mode) takes priority over env key."""
    mock_client = _make_client(sifts=[{"id": "s1"}])
    token = srv._request_api_key.set("sk-from-bearer")
    try:
        with patch("sifter_mcp.server.Sifter", return_value=mock_client) as mock_cls:
            srv._env_api_key = "sk-from-env"
            srv.list_sifts()
        _, kwargs = mock_cls.call_args
        assert mock_cls.call_args[1]["api_key"] == "sk-from-bearer" or \
               mock_cls.call_args[0][1] == "sk-from-bearer" or \
               "sk-from-bearer" in str(mock_cls.call_args)
    finally:
        srv._request_api_key.reset(token)


def test_get_folder():
    mock_client = _make_client()
    mock_client.get_folder.return_value.documents.return_value = [{"id": "d1"}]
    mock_client.get_folder.return_value.sifts.return_value = [{"id": "s1"}]
    with patch("sifter_mcp.server.Sifter", return_value=mock_client):
        srv._env_api_key = "sk-test"
        result = srv.get_folder("f1")
    assert result == {"documents": [{"id": "d1"}], "sifts": [{"id": "s1"}]}
