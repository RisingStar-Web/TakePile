// contracts/GameItem.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "@openzeppelin/contracts/utils/Base64.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

contract LiquidationPass is ERC721, ERC721Enumerable, ERC721URIStorage, Ownable {
    using Counters for Counters.Counter;
    Counters.Counter private _tokenIds;

    string private _imageUrl;

    constructor(string memory imageUrl) ERC721("Takepile Liquidation Pass", "Liquidation Pass") {
        _imageUrl = imageUrl;
        _tokenIds.increment();
        assert(_tokenIds.current() == 1);
    }

    function _burn(uint256 amount) internal override(ERC721, ERC721URIStorage) {
        super._burn(amount);
    }

    function tokenURI(uint256 tokenId)
        public
        view
        virtual
        override(ERC721, ERC721URIStorage)
        returns (string memory)
    {
        return super.tokenURI(tokenId);
    }

    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 tokenId
    ) internal override(ERC721, ERC721Enumerable) {
        super._beforeTokenTransfer(from, to, tokenId);
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721, ERC721Enumerable)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }

    /// @notice purchase a liquidation pass NFT
    /// @notice price grows exponentionally on each purchase, price = tokenId^2
    function purchase() public payable returns (uint256) {
        uint256 newItemId = _tokenIds.current();
        _tokenIds.increment();
        uint256 price = this.getPrice(newItemId);
        require(msg.value >= price, "Not enough sent to mint");
        _mint(msg.sender, newItemId);
        string memory json = Base64.encode(
            bytes(
                string(
                    abi.encodePacked(
                        "{",
                        '"name": "Takepile Liquidation Pass #',
                        Strings.toString(newItemId),
                        '",',
                        '"description": "",',
                        '"image": "',
                        _imageUrl,
                        '"',
                        "}"
                    )
                )
            )
        );
        string memory base64 = string(abi.encodePacked("data:application/json;base64,", json));
        _setTokenURI(newItemId, base64);
        return newItemId;
    }

    /// @notice x^2 * 5
    /// @param id the id of the token to get price for
    function getPrice(uint256 id) external pure returns (uint256) {
        return id * id * 5 ether;
    }

    /// @notice withdraw amount of contract balance to a recipient
    /// @param amount the amount to withdraw from contract
    /// @param recipient the address to receive amount
    function withdraw(uint256 amount, address payable recipient) external onlyOwner {
        require(amount <= address(this).balance, "Amount exceeds balance");
        recipient.transfer(amount);
    }

    /// @notice withdraw full contract balance to a recipient
    /// @param recipient the address to receive contract balance
    function drain(address payable recipient) external onlyOwner {
        recipient.transfer(address(this).balance);
    }
}
