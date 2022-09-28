const { expect } = require("chai");
const { ethers, hre } = require("hardhat");
const { utils, BigNumber } = require('ethers');

describe("TakepileFactory", function () {
  let underlyingToken,
    takeToken,
    takepileFactory,
    xTakeFactory,
    driver,
    priceConsumer,
    owner,
    alice,
    bob,
    charlie,
    treasury;
  let ownerAddr, aliceAddr, bobAddr, charlieAddr, treasuryAddr;

  before(async function () {
    [owner, alice, bob, charlie, treasury] = await ethers.getSigners();
    [ownerAddr, aliceAddr, bobAddr, charlieAddr, treasuryAddr] = await Promise.all(
      [owner, alice, bob, charlie, treasury].map((x) => x.getAddress())
    );

    const TestToken = await ethers.getContractFactory("TestToken");
    underlyingToken = await TestToken.deploy("TestToken", "TEST", 1000000);
    await underlyingToken.deployed();

    takeToken = await TestToken.deploy("Takepile Governance", "TAKE", 1000000);
    await takeToken.deployed();

    const TakepileFactory = await ethers.getContractFactory("TakepileFactory");
    takepileFactory = await TakepileFactory.deploy();
    await takepileFactory.deployed();

    await takepileFactory.transferOwnership(owner.address);

    const XTakeFactory = await ethers.getContractFactory("xTakeFactory");
    xTakeFactory = await XTakeFactory.deploy();
    await takepileFactory.deployed();

    const LiquidationPass = await ethers.getContractFactory("LiquidationPass");
    liquidationPass = await LiquidationPass.deploy("https://takepile.com/liquidation-pass.gif");
    await liquidationPass.deployed();

    const TakepileDriver = await ethers.getContractFactory("TakepileDriver");
    driver = await TakepileDriver.deploy(
      takeToken.address,
      takepileFactory.address,
      xTakeFactory.address,
      treasuryAddr,
      liquidationPass.address
    );
    await driver.deployed();

    // Initial balances
    await underlyingToken.transfer(aliceAddr, 1000);
    await underlyingToken.transfer(bobAddr, 1000);
    await underlyingToken.transfer(charlieAddr, 1000);

  });

  describe("Deployment", function () {
    it("Should initialize with correct owner", async function () {
      expect(await takepileFactory.owner()).to.be.eq(ownerAddr);
    });
  });

  describe("Takepile creation", function () {
    it("Should properly create a takepile", async function () {
      const tx = await takepileFactory.createTakepile(driver.address, xTakeFactory.address, underlyingToken.address, "Takepile TestToken", "pileTEST", 1);
      expect(tx).to.be.ok;
    });
  });

});
