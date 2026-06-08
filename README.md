System Background: Ahmad Al Abdalla Inter-Branch Transfer System
Context
Ahmad Al Abdalla is a Lebanese grilled chicken restaurant chain founded in 1987 in Adshit, Nabatieh. With 50+ branches across 12+ countries, day-to-day operations across branches sometimes require informal resource sharing — a branch running low on bread, packaging, or other supplies before their next restock will borrow from a nearby branch.
Currently, these transfers happen informally with no structured record-keeping, making it difficult to track who borrowed what, whether it was returned, and what the financial impact is across branches.

Problem

Transfers between branches happen regularly but are untracked
No visibility into which branches are net borrowers vs net lenders
No way to know if borrowed items were returned or written off
No financial accountability — the cost of these transfers is invisible to management


Solution
A lightweight internal web system used by a single manager to log, track, and report on all inter-branch item transfers. The system treats each transfer as a loan — items are expected to be returned, and the system tracks whether they were fully returned, partially returned, or still outstanding.

Core Concept
Every transfer has a simple lifecycle:
Logged (pending) → Partially Returned → Fully Returned
                                      ↘ Still Outstanding
The manager logs a transfer when it happens, then updates it when items come back. At any point, the report gives a live snapshot of what's outstanding and what it's worth.

Who Uses It
A single operations manager overseeing all Lebanese branches. No multi-user auth needed for now — though the architecture leaves room for it later.

Scope
In scope:

Branch management (add/edit branches)
Item catalog with price per unit
Log transfers between branches
Mark transfers as returned (full or partial)
Report: per branch, per item, and full P&L summary

Out of scope (for now):

Stock level tracking per branch
Automatic restock notifications
Multi-user roles or permissions
Mobile app
Integration with POS or inventory systems


Why It Matters
Even small informal transfers add up. If a branch borrows 50 loaves of bread at $0.10 each twice a week, that's $520/year from one item at one branch — invisible without a system. Across 10+ branches and multiple items, the financial picture becomes significant. This system makes it visible and accountable.
