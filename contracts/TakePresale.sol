//SPDX-License-Identifier: MIT
pragma solidity >=0.8.4;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";

interface IERC20Basic {
    function decimals() external returns (uint8);
}

contract TakePresale is Ownable, Pausable {
    using SafeERC20 for IERC20;
    using SafeMath for uint256;

    /// @dev TAKE token price = 0.5 USDC
    uint256 public immutable TAKE_PRICE;

    /// @dev MAX BUY Limitation
    uint256 public immutable TAKE_MAX_BUY;

    /// @dev USDC contract address
    address public immutable USDC;

    /// @dev TAKE contract address
    address public immutable TAKE;

    /// @dev TAKE Presale Start Time
    uint256 public startTime;

    /// @dev TAKE Presale End Time
    uint256 public endTime;

    /// @dev TAKE Sales
    mapping(address => uint256) public sales;

    constructor(
        uint256 _takePrice,
        uint256 _takeMaxBuy,
        address _usdc,
        address _take
    ) {
        TAKE_PRICE = _takePrice;
        TAKE_MAX_BUY = _takeMaxBuy;
        USDC = _usdc;
        TAKE = _take;
        _pause();
    }

    /**
     * @dev Set presale duration time
     * @param _start presale start time
     * @param _end presale end time
     */
    function setPresaleDuration(uint256 _start, uint256 _end) external onlyOwner {
        require(_start > block.timestamp, "Invalid presale start time");
        require(_start < _end, "Invalid presale end time");

        startTime = _start;
        endTime = _end;
    }

    /**
     * @dev Pause pre-sale
     */
    function pause() external onlyOwner {
        _pause();
    }

    /**
     * @dev Unpause pre-sale
     */
    function unpause() external onlyOwner {
        _unpause();
    }

    /**
     * @dev Withdraw TAKE & USDC
     * @param _to Funds receiver address
     */
    function withdraw(address _to) external onlyOwner {
        require(block.timestamp > endTime, "Presale has not ended");

        IERC20 take = IERC20(getTAKE());
        IERC20 usdc = IERC20(getUSDC());

        take.safeTransfer(_to, take.balanceOf(address(this)));
        usdc.safeTransfer(_to, usdc.balanceOf(address(this)));
    }

    /**
     * @dev Buy TAKE
     * @param takeAmount the amount of TAKE to purchase
     */
    function buy(uint256 takeAmount) external whenNotPaused {
        require(block.timestamp >= startTime, "Presale has not started");
        require(block.timestamp <= endTime, "Presale has ended");
        require(takeAmount > 0, "Invalid purchase amount");

        uint256 cost = takeAmount.mul(TAKE_PRICE).div(1e18);
        sales[msg.sender] = sales[msg.sender].add(takeAmount);

        require(sales[msg.sender] <= TAKE_MAX_BUY, "Purchase exceeds max buy amount");
        IERC20(getUSDC()).safeTransferFrom(msg.sender, address(this), cost);

        require(IERC20(getTAKE()).balanceOf(address(this)) > takeAmount, "Insufficient presale balance");
        IERC20(getTAKE()).safeTransfer(msg.sender, takeAmount);
    }

    /**
     * @dev Get USDC contract address
     */
    function getUSDC() public view returns (address) {
        return USDC;
    }

    /**
     * @dev Get TAKE contract address
     */
    function getTAKE() public view returns (address) {
        return TAKE;
    }
}
