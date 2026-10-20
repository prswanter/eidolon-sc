"""Chance, as every module that needs it takes it: a function tests can replace, as they do
the clock."""

import secrets
from collections.abc import Callable

Random = Callable[[int], int]
"""A number below the one given, from 0, each as likely as another."""

secure_random: Random = secrets.randbelow
"""The system's own, fit for what users would game."""
