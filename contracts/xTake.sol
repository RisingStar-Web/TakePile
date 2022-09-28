//SPDX-License-Identifier: MIT
pragma solidity >=0.8.4;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

import "./interfaces/IxTake.sol";

/// @title xTake
/// @notice responsible for distributing Takepile fees to TAKE stakers
contract xTake is IxTake, ERC20, Ownable, ReentrancyGuard {
    using Address for address;
    using SafeERC20 for ERC20;

    /// @notice Distributor contract
    uint256 public version = 1;

    /// @notice the Takepile Governance token address
    address public TAKE;

    /// @notice the Takepile token address to distribute fees
    address public pile;

    uint256 public dividendPointsPerToken;
    mapping(address => uint256) public dividendPointsBalance;
    mapping(address => uint256) public dividendPointsCredited;

    uint256 public pointMultiplier = 10e27;

    /// @notice called on every distribution;
    event Distribution(uint256 amount);

    /// @notice xTake constructor
    /// @param _TAKE the TAKE governance token address
    constructor(
        address _TAKE,
        address _pile,
        string memory _symbol
    )
        ERC20(
            string(abi.encodePacked("xTAKE", " (", _symbol, ")")),
            string(abi.encodePacked("xTAKE", " (", _symbol, ")"))
        )
    {
        transferOwnership(msg.sender);
        TAKE = _TAKE;
        pile = _pile;
    }

    /// @notice deposit TAKE and for xTAKE
    function stake(uint256 amount) external override nonReentrant {
        require(amount > 0, "xTake: amount cannot be zero");
        ERC20(TAKE).safeTransferFrom(msg.sender, address(this), amount);
        _mint(msg.sender, amount);
    }

    /// @notice withdraw TAKE and burn xTAKE
    function unstake(uint256 amount) external override nonReentrant {
        require(amount > 0, "xTake: amount cannot be zero");
        _burn(msg.sender, amount);
        ERC20(TAKE).safeTransfer(msg.sender, amount);
    }

    /// @notice get amount claimable
    function claimable(address account) external view override returns (uint256) {
        uint256 owedPoints = dividendPointsPerToken - dividendPointsCredited[account];

        return (dividendPointsBalance[account] + balanceOf(account) * owedPoints) / pointMultiplier;
    }

    /// @notice claim pileToken staking awards that have accrued
    function claim(uint256 amount) external override nonReentrant returns (uint256) {
        update(msg.sender);
        require(
            dividendPointsBalance[msg.sender] >= amount * pointMultiplier,
            "xTAKE: insufficient claim balance"
        );
        dividendPointsBalance[msg.sender] -= amount * pointMultiplier;
        ERC20(pile).safeTransfer(msg.sender, amount);
        return amount;
    }

    /// @notice distribute pileToken to users who have staked TAKE
    function distribute(uint256 amount) external override onlyOwner {
        /// If there are no stakers to distribute to, do nothing
        if (totalSupply() > 0) {
            dividendPointsPerToken += (amount * pointMultiplier) / totalSupply();
            ERC20(pile).safeTransferFrom(msg.sender, address(this), amount);
            emit Distribution(amount);
        }
    }

    /// @notice reconcile pending account distributions
    function update(address account) internal {
        uint256 owedPoints = dividendPointsPerToken - dividendPointsCredited[account];
        dividendPointsBalance[account] += balanceOf(account) * owedPoints;
        dividendPointsCredited[account] = dividendPointsPerToken;
    }

    /// @notice reconcile pending account distributions before any token transfer (including mint and burn)
    function _beforeTokenTransfer(
        address from,
        address to,
        uint256
    ) internal virtual override {
        update(from);
        update(to);
    }
}
