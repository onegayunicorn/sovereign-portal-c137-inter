"""Ensure the ``apps/soe-core`` package directory is importable from tests.

The blueprints import ``soe_core`` / ``voice_omega`` / ``gateway`` /
``rick_persona`` as top-level modules, so the module directory must be on
``sys.path`` when pytest is invoked from the monorepo root.
"""

import os
import sys

SOE_CORE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if SOE_CORE_DIR not in sys.path:
    sys.path.insert(0, SOE_CORE_DIR)
