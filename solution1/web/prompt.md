The web site is split into several pages.

## Lock Scripts
Each cell type uses a specific lock script, as follows:
- proposal cell: initiator's lock script
- vote cell: voter's lock script
- counting cell: initiator's lock script
- finalized proposal cell: always-success lock script
- passed proposal cell: initiator's lock script

Unlocking these lock scripts requires interaction with the wallet for signing.


## Welcome Page
This is the first page users see when they visit the site. A wallet address indicator sits in the top right corner. When no wallet is connected,
click it to connect a wallet. It displays the CKB address.

The page offers 2 entries: "For Proposal Initiator" and "For Voter". If either is clicked while no wallet is connected,
the user is prompted to connect a wallet. The connected CKB address is used as voter or initiator's lock script.

This page displays all information about the config cell. See VotingConfig.

## `For Voter` Page
On this page, a DAO owner can vote on proposals. It should list all proposals available within the voting window. Outdated proposals should not be displayed.
For every proposal, it should display the following information:

* ProposalCellData.description
* ProposalCellData.requested_amount
* ProposalCellData.recipient_lock_hash
* how many "yes" votes it has (in CKBytes)
* how many "no" votes it has (in CKBytes)
* time left: in block number and estimated in seconds, assuming 8 seconds per block

If the user has not yet voted on a given proposal, a vote button appears near it. Click the "vote" button to cast a vote using the entire DAO deposit.
If the user has voted on a given proposal, display the vote cell with the following information:
- how many CKBytes were voted
- the block number when the vote was cast

A "withdraw" button appears next to the vote cell; click it to withdraw the vote.


## `For Proposal Initiator` Page
On this page, a proposal initiator can perform operations on proposals, such as creating, counting, finalizing, and passing.
A button creates a proposal from the following information:
* ProposalCellData.description
* ProposalCellData.requested_amount
* ProposalCellData.recipient_lock_hash

A button checks whether the proposal can pass. If it cannot, the initiator need not bother continuing to count.

A button counts the votes. When clicked, it prompts users with how many counting cells were generated.
FUTURE feature: filter out vote cells containing very small amounts (dust attack).

A button finalizes. It consumes all counting cells and the proposal cell, then generates a finalized proposal cell.
FUTURE feature: the initiator can choose which counting cells to use, since some counting cells may be unusable.

A button passes. It consumes a finalized proposal cell and generates a new passed proposal cell.

On the page, it should display the following cells connected to this CKB address:
- proposal cell
- finalized proposal cell
- passed proposal cell

Each cell should display enough ProposalCellData information, and have the relevant buttons attached to it.
Each proposal cell and finalized proposal cell should display a countdown in block numbers and seconds, notifying the initiator how much time remains before the next operation.

## `For Challenger` Page
This page displays all finalized proposal cells. It can reuse the proposal cell element from the `For Proposal Initiator` page.

A button checks whether the finalized proposal cells can be challenged.

A button counts the votes. It only collects `no` votes.

A button challenges. It consumes all "no" counting cells and the finalized proposal cell, then generates a cell specified by the challenger.
So any challenger can receive this cell as an incentive.
