"""
Sifter Quickstart Example

This example demonstrates how to use the Sifter SDK to:
1. Create an extraction
2. Process documents
3. Query the extracted data
4. Export to CSV

Prerequisites:
    pip install sifter-ai

    Set SIFTER_LLM_API_KEY environment variable (or pass api_key directly).
    Ensure MongoDB is running at localhost:27017 (or use docker-compose).
"""

import os
from pathlib import Path
from sifter import Sifter

# Initialize Sifter in direct mode (no server needed)
s = Sifter(
    mongodb_uri=os.getenv("SIFTER_MONGODB_URI", "mongodb://localhost:27017"),
    llm_model=os.getenv("SIFTER_LLM_MODEL", "openai/gpt-4o"),
    llm_api_key=os.getenv("SIFTER_LLM_API_KEY", ""),
    mode="direct",
)

# Create an extraction
print("Creating extraction...")
ext = s.create_extraction(
    name="Sample Invoices",
    instructions="Extract: client name, invoice date, total amount, VAT number, invoice number",
    description="Demo extraction from quickstart example",
)
print(f"Created extraction: {ext.id}")

# Add documents from a directory or file
# Uncomment to use real files:
# ext.add_documents("./invoices/")

# For demo purposes, let's just use the extraction ID
print(f"Extraction ID: {ext.id}")
print("\nNext steps:")
print("  1. Upload documents via the web UI at http://localhost:3000")
print("  2. Or upload via the API: POST /api/extractions/{id}/upload")
print("  3. Or use the SDK: ext.add_documents('./your_documents/')")
print("\nTo query once documents are processed:")
print("  results = ext.query('Total amount by client')")
print("  print(results)")
print("\nTo export to CSV:")
print("  ext.export_csv('./output.csv')")
