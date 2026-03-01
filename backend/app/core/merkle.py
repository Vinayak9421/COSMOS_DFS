import hashlib
from typing import List, Dict, Optional


def _sha256_pair(left: str, right: str) -> str:
    """Hash two hex-string hashes together into one."""
    return hashlib.sha256((left + right).encode()).hexdigest()


def build_tree(leaf_hashes: List[str]) -> List[List[str]]:
    """
    Builds a full Merkle tree bottom-up.
    Returns a list of levels: levels[0] = leaves, levels[-1] = [root].
    Odd number of nodes: duplicate the last node (standard Bitcoin approach).
    """
    if not leaf_hashes:
        return []

    levels: List[List[str]] = [leaf_hashes[:]]
    current = leaf_hashes[:]

    while len(current) > 1:
        if len(current) % 2 == 1:
            current.append(current[-1])     # duplicate last leaf for odd count

        next_level = [
            _sha256_pair(current[i], current[i + 1])
            for i in range(0, len(current), 2)
        ]
        levels.append(next_level)
        current = next_level

    return levels


def compute_merkle_root(leaf_hashes: List[str]) -> str:
    """
    Returns the single root hash representing all leaf_hashes.
    For a single chunk, returns that chunk's hash directly.
    """
    if not leaf_hashes:
        return ""
    if len(leaf_hashes) == 1:
        return leaf_hashes[0]

    levels = build_tree(leaf_hashes)
    return levels[-1][0]


def generate_proof(leaf_hashes: List[str], target_index: int) -> List[Dict]:
    """
    Generates a Merkle proof for the leaf at target_index.

    Returns a list of proof steps, each:
        {"hash": str, "position": "left" | "right"}

    "position" indicates where the SIBLING sits relative to the current node.
    To verify: walk the steps, combining current hash with sibling at stated position.
    """
    if not leaf_hashes or target_index >= len(leaf_hashes):
        return []

    if len(leaf_hashes) == 1:
        return []   # root == leaf, no proof steps needed

    proof: List[Dict] = []
    current_level = leaf_hashes[:]
    current_index = target_index

    while len(current_level) > 1:
        if len(current_level) % 2 == 1:
            current_level.append(current_level[-1])

        if current_index % 2 == 0:
            # current node is left child — sibling is to the right
            sibling_index = current_index + 1
            sibling_position = "right"
        else:
            # current node is right child — sibling is to the left
            sibling_index = current_index - 1
            sibling_position = "left"

        proof.append({
            "hash": current_level[sibling_index],
            "position": sibling_position,
        })

        # Build next level up
        next_level = [
            _sha256_pair(current_level[i], current_level[i + 1])
            for i in range(0, len(current_level), 2)
        ]
        current_index = current_index // 2
        current_level = next_level

    return proof


def verify_proof(leaf_hash: str, proof: List[Dict], expected_root: str) -> bool:
    """
    Verifies a Merkle proof without needing the full tree.

    Reconstructs the root by combining leaf_hash with each proof step,
    then compares to expected_root.
    """
    current = leaf_hash

    for step in proof:
        if step["position"] == "right":
            current = _sha256_pair(current, step["hash"])
        else:
            current = _sha256_pair(step["hash"], current)

    return current == expected_root
