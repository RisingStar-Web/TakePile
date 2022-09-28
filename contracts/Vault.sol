//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

import "./interfaces/ITakepileDriver.sol";

contract Vault is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    string public name;
    address public driver;
    address public token;

    struct Stake {
        uint256 timestamp;
        uint256 lockup; // the original lockup time
        uint256 amount; // the amount of ERC20 tokens that are locked
        uint256 unlock; // when the locked ERC20 tokens can be unstaked
        uint256 nextClaim; // the next time the distribution rewards can be claimed
        uint256 lastUpdated; // updated on distribution
    }

    mapping(address => Stake[]) public stakes; // address -> Stake;

    constructor(
        string memory _name,
        address _driver,
        address _token
    ) {
        name = _name;
        driver = _driver;
        token = _token;
    }

    /// @notice Stake amount for a specific amount of lockup
    /// @param amount the amount of token to stake
    /// @param lockup the lockup period for this staking position
    function stake(uint256 amount, uint256 lockup) external nonReentrant {
        require(
            IERC20(token).balanceOf(msg.sender) >= amount,
            "Vault: insufficient amount to stake"
        );
        stakes[msg.sender].push(
            Stake(
                block.timestamp,
                lockup,
                amount,
                block.timestamp + lockup,
                block.timestamp + 7 days,
                block.timestamp
            )
        );
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
    }

    /// @notice Unstake a position at a specific index, for a specific amount
    /// @notice Next claim and unlock period should remain the same
    /// @dev will autoclaim rewards if reward is claimable
    /// @param index the index of msg.sender's staking position to withdraw tokens from
    /// @param amount the amount of token to unstake
    function unstake(uint256 index, uint256 amount) external nonReentrant {
        Stake storage s = stakes[msg.sender][index];
        require(block.timestamp >= s.unlock, "Vault: unlock period not reached");
        require(amount <= s.amount, "Vault: insufficient amount to unstake");
        if (block.timestamp >= s.nextClaim) {
            autoclaim(s);
        }
        s.amount = s.amount - amount;
        IERC20(token).safeTransfer(msg.sender, amount);
    }

    /// @notice Claim rewards for staking position at a given index
    /// @param index the index of msg.sender's staking position to claim rewards on
    function claim(uint256 index) public nonReentrant {
        Stake storage s = stakes[msg.sender][index];
        require(block.timestamp >= s.nextClaim, "Vault: next claim period not reached");

        uint256 elapsed = block.timestamp - s.lastUpdated;
        s.lastUpdated = block.timestamp;
        s.nextClaim = block.timestamp + 7 days;

        ITakepileDriver(driver).distributeTakeFromVault(msg.sender, s.amount, elapsed, s.lockup);
    }

    /// @notice internal autoclaim function
    /// @param s Stake struct
    function autoclaim(Stake storage s) internal {
        uint256 elapsed = block.timestamp - s.lastUpdated;
        s.lastUpdated = block.timestamp;
        s.nextClaim = block.timestamp + 7 days;
        ITakepileDriver(driver).distributeTakeFromVault(msg.sender, s.amount, elapsed, s.lockup);
    }

    /// @notice get the maximum number of staking positions a user has
    /// @param user the address of the user to check
    function getStakeCount(address user) public view returns (uint256) {
        return stakes[user].length;
    }

    /// @notice get the amount available to claim for a given stake
    /// @param index the index of msg.sender's staking position to get available claims for
    function getAvailableClaim(uint256 index) public returns (uint256) {
        Stake storage s = stakes[msg.sender][index];
        if (block.timestamp <= s.nextClaim) return 0;
        uint256 elapsed = block.timestamp - s.lastUpdated;

        uint256 rate = ITakepileDriver(driver).getVaultDistributionRate(address(this), s.lockup);
        return ITakepileDriver(driver).calculateDistribution(rate, s.amount, elapsed);
    }
}
