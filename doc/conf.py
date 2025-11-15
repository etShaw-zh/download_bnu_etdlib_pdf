"""Sphinx configuration for the 小鸦PDF documentation."""

from __future__ import annotations

import os
import sys
from datetime import datetime

# Ensure the project root is on sys.path so autodoc (if used later) can import modules.
sys.path.insert(0, os.path.abspath(".."))

project = "小鸦PDF"
author = "etShaw"
current_year = datetime.now().year
release = "latest"

language = "zh_CN"
extensions: list[str] = []
templates_path = ["_templates"]
exclude_patterns = ["_build"]

html_theme = "sphinx_rtd_theme"
html_static_path = ["_static"]
