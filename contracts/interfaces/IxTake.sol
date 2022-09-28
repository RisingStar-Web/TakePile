// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0;

interface IxTake {
    
    function stake(uint256 amount) external;

    function unstake(uint256 amount) external;

    function claimable(address account) external view returns (uint256);

    function claim(uint256 amount) external returns (uint256);
    
    function distribute(uint256 amount) external;
    
}
