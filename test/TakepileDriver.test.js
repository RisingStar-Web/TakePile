const { expect } = require("chai");
const { ethers, hre } = require("hardhat");
const { utils, BigNumber } = require('ethers');

describe("TakepileDriver", function () {
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

    // Transfer takepileFactory ownership to driver
    takepileFactory.transferOwnership(driver.address);

    const MockPriceConsumer = await ethers.getContractFactory(
      "MockPriceConsumer"
    );
    priceConsumer = await MockPriceConsumer.deploy();
    await priceConsumer.deployed();

    // Initial balances
    await underlyingToken.transfer(aliceAddr, 1000);
    await underlyingToken.transfer(bobAddr, 1000);
    await underlyingToken.transfer(charlieAddr, 1000);

    // Set initial token price
    await priceConsumer.setPrice(underlyingToken.address, 100);
  });

  describe("Deployment", function () {
    it("Should initialize with no takepiles", async function () {
      const config = await driver.takepileConfig(underlyingToken.address);
      expect(config.timestamp).to.be.eq(0);
      expect(config.distributionRate).to.be.eq(0);
    });
  });

  describe("Takepile creation", function () {
    it("Should properly create a takepile", async function () {
      expect(await driver.createTakepile(underlyingToken.address, 'Takepile TestToken', 'pileTEST', 1))
        .to.emit(driver, "TakepileCreated")
        .withArgs('0x9bd03768a7DCc129555dE410FF8E85528A4F88b5', 'Takepile TestToken', 'pileTEST');

      const address = await driver.takepiles(0);
      expect(address).to.be.eq('0x9bd03768a7DCc129555dE410FF8E85528A4F88b5');

      const takepile = await ethers.getContractAt("TakepileToken", address);
      expect(await takepile.name()).to.be.eq("Takepile TestToken");
      expect(await takepile.owner()).to.be.eq(ownerAddr);

      const config = await driver.takepileConfig(address);
      expect(parseInt(config.timestamp)).to.be.greaterThan(0);
      expect(config.distributionRate).to.be.eq(0);

      expect(await takepile.driver()).to.be.eq(driver.address);
    });
  });

  describe("Calculate simple interest", function () {
    it("Should calculate simple interest correctly", async function () {
      const principal = utils.parseUnits("100", 18);
      const rate = utils.parseUnits("0.05", 27);
      const t = BigNumber.from(10);

      const interest = await driver.calculateSimpleInterest(
        principal,
        rate,
        t
      );
      expect(interest).to.be.eq(utils.parseUnits("50", 18));
    });
  });

  describe("Calculate reward", function () {
    it("Should calculate mock profits/losses correctly", async function () {

      expect(await driver.calculateReward(100, 100, 100, true)).to.be.eq(0);
      expect(await driver.calculateReward(100, 100, 120, true)).to.be.eq(20);
      expect(await driver.calculateReward(200, 100, 80, true)).to.be.eq(-40);
      expect(await driver.calculateReward(200, 100, 80, false)).to.be.eq(40);
      expect(await driver.calculateReward(500, 100, 80, false)).to.be.eq(
        100
      );
      expect(await driver.calculateReward(500000, 100, 80, false)).to.be.eq(
        100000
      );


      // leverage brainstorming
      // say I stake 100 pileUSDT on a trade with 10x leverage so position size is 1000 pileUSDT
      // price goes up 10%, so should get 100 as reward... i.e. 100*10%*10 = 100
      expect(await driver.calculateReward(1000, 100, 110, true)).to.be.eq(100);

      // if price goes down 20%, then loss will be greater than collateral
      expect(await driver.calculateReward(1000, 100, 80, true)).to.be.eq(-200);


      
    });
  });

});
