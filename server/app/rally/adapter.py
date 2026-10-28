"""RallyAdapter: every Rally query and write the proxy makes (spec §6). Returns domain objects only."""
from .portfolio import PortfolioReads
from .writes import IssueWrites


class RallyAdapter(IssueWrites, PortfolioReads):
    """Issue reads (via both bases), writes, and the PM layer's reads."""
