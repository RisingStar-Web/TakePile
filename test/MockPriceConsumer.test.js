const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Mock PriceConsumer", function () {
  it("Should return mock price", async function () {
    const PriceConsumer = await ethers.getContractFactory("MockPriceConsumer");
    const priceConsumer = await PriceConsumer.deploy();
    await priceConsumer.deployed();

    expect(await priceConsumer.getLatestPrice(priceConsumer.address)).to.equal(0);

    await priceConsumer.setPrice(priceConsumer.address, 1000);
    expect(await priceConsumer.getLatestPrice(priceConsumer.address)).to.equal(1000);
  });
});
