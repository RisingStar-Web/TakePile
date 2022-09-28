const { expect } = require("chai");
const { ethers } = require("hardhat");
const { utils, BigNumber } = require("ethers");

describe("TakepileToken leverage without fees", function () {
  let underlyingToken,
    takeToken,
    pileToken,
    takepileFactory,
    xTakeFactory,
    driver,
    priceConsumer,
    owner,
    alice,
    bob,
    charlie,
    treasury;
  let aliceAddr, bobAddr, charlieAddr, treasuryAddr;

  const dollar = (n) => {
    return utils.parseUnits(String(n), 18);
  }

  beforeEach(async function () {
    [owner, alice, bob, charlie, treasury] = await ethers.getSigners();
    [aliceAddr, bobAddr, charlieAddr, treasuryAddr] = await Promise.all(
      [alice, bob, charlie, treasury].map((x) => x.getAddress())
    );

    const TestToken = await ethers.getContractFactory("TestToken");
    underlyingToken = await TestToken.deploy("TestToken", "TEST", dollar(10000));
    await underlyingToken.deployed();

    takeToken = await TestToken.deploy("Takepile Governance", "TAKE", dollar(100000000));
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

    await driver.createTakepile(underlyingToken.address, "Takepile TestToken", "pileTEST", 2);
    pileToken = await ethers.getContractAt(
      "TakepileToken",
      await driver.takepiles(0)
    );

    const MockPriceConsumer = await ethers.getContractFactory(
      "MockPriceConsumer"
    );
    priceConsumer = await MockPriceConsumer.deploy();
    await priceConsumer.deployed();

    // Initial balances
    await underlyingToken.transfer(aliceAddr, dollar(1000));
    await underlyingToken.transfer(bobAddr, dollar(1000));
    await underlyingToken.transfer(charlieAddr, dollar(1000));

    // Set initial token price
    await priceConsumer.setPrice(underlyingToken.address, 100);

    await driver.setTakepileDistributionRate(
      pileToken.address,
      "1522070015220700152"
    );

    await driver.setTakepileFeeDivisors(
      pileToken.address,
      0,
      0,
      0,
      0
    );
    

    // Initial deposit
    expect(await underlyingToken.balanceOf(aliceAddr)).to.be.eq(dollar(1000));
    await underlyingToken.connect(alice).approve(pileToken.address, dollar(1000));
    await pileToken.connect(alice).deposit(dollar(1000));

    // add market
    expect(
      await pileToken.addMarket(
        "ETHUST",
        priceConsumer.address,
        underlyingToken.address
      )
    ).to.be.ok;
  
  });


  describe("Entering / Exiting positions", function () {
    it("Should fully exit leveraged position with no price change", async function () {

      expect(await underlyingToken.balanceOf(aliceAddr)).to.be.eq(0);
      expect(await pileToken.balanceOf(aliceAddr)).to.be.eq(dollar(1000));

      // allow alice to transfer alice's pileTokens
      await pileToken.connect(alice).approve(pileToken.address, dollar(1000));
      // Enter mock position and calculate reward
      await priceConsumer.setPrice(underlyingToken.address, 100);

      // collateral 100, positionAmount 200
      expect(await pileToken.connect(alice).placeMarketIncrease(
        "ETHUST", 
        dollar(200), 
        dollar(100),  
        true
      )).to.be.ok;
      expect(await pileToken.balanceOf(aliceAddr)).to.be.eq(dollar(900));

      expect((await pileToken.positions(aliceAddr, 'ETHUST')).amount).to.be.eq(dollar(200));
      expect((await pileToken.positions(aliceAddr, 'ETHUST')).collateral).to.be.eq(dollar(100));
      await priceConsumer.setPrice(underlyingToken.address, 100); // 0%
      expect(await pileToken.connect(alice).placeMarketDecrease(
        "ETHUST", 
        dollar(200),
        dollar(100),
      )).to.be.ok;
      expect((await pileToken.positions(aliceAddr, 'ETHUST')).amount).to.be.eq(dollar(0));
      expect((await pileToken.positions(aliceAddr, 'ETHUST')).collateral).to.be.eq(dollar(0));
      expect(await pileToken.balanceOf(aliceAddr)).to.be.eq(dollar(1000));

    });

    it("Should partially exit leveraged position with no price change", async function () {

      expect(await underlyingToken.balanceOf(aliceAddr)).to.be.eq(0);
      expect(await pileToken.balanceOf(aliceAddr)).to.be.eq(dollar(1000));

      // allow alice to transfer alice's pileTokens
      await pileToken.connect(alice).approve(pileToken.address, dollar(1000));
      // Enter mock position and calculate reward
      await priceConsumer.setPrice(underlyingToken.address, 100);

      expect(await pileToken.connect(alice).placeMarketIncrease(
        "ETHUST", 
        dollar(200), 
        dollar(100), 
        true
      )).to.be.ok;
      expect(await pileToken.balanceOf(aliceAddr)).to.be.eq(dollar(900));

      expect((await pileToken.positions(aliceAddr, 'ETHUST')).amount).to.be.eq(dollar(200));
      expect((await pileToken.positions(aliceAddr, 'ETHUST')).collateral).to.be.eq(dollar(100));

      await priceConsumer.setPrice(underlyingToken.address, 100); // 0%
      expect(await pileToken.connect(alice).placeMarketDecrease(
        "ETHUST", 
        dollar(100),
        dollar(50),
      )).to.be.ok;
      expect((await pileToken.positions(aliceAddr, 'ETHUST')).amount).to.be.eq(dollar(100));
      expect((await pileToken.positions(aliceAddr, 'ETHUST')).collateral).to.be.eq(dollar(50));
      expect(await pileToken.balanceOf(aliceAddr)).to.be.eq(dollar(950)); 

      // Close rest of position
      expect(await pileToken.connect(alice).placeMarketDecrease(
        "ETHUST", 
        dollar(100),
        dollar(50),
      )).to.be.ok;
  
      expect((await pileToken.positions(aliceAddr, 'ETHUST')).amount).to.be.eq(dollar(0));
      expect((await pileToken.positions(aliceAddr, 'ETHUST')).collateral).to.be.eq(dollar(0));
      expect(await pileToken.balanceOf(aliceAddr)).to.be.eq(dollar(1000));

    });

    it("Show throw error if position increase exceeds maximum leverage", async () => {

      expect(await underlyingToken.balanceOf(aliceAddr)).to.be.eq(0);
      expect(await pileToken.balanceOf(aliceAddr)).to.be.eq(dollar(1000));

      // allow alice to transfer alice's pileTokens
      await pileToken.connect(alice).approve(pileToken.address, dollar(1000));
      // Enter mock position and calculate reward
      await priceConsumer.setPrice(underlyingToken.address, 100);

      await expect(pileToken.connect(alice).placeMarketIncrease(
        "ETHUST", 
        dollar(201), 
        dollar(100),  
        true
      )).to.be.revertedWith("Takepile: maximum leverage exceeded")
    });

    it("Show throw error if position decrease exceeds maximum leverage", async () => {

      expect(await underlyingToken.balanceOf(aliceAddr)).to.be.eq(0);
      expect(await pileToken.balanceOf(aliceAddr)).to.be.eq(dollar(1000));

      // allow alice to transfer alice's pileTokens
      await pileToken.connect(alice).approve(pileToken.address, dollar(1000));
      // Enter mock position and calculate reward
      await priceConsumer.setPrice(underlyingToken.address, 100);

      // collateral 101, positionAmount 200
      // 199.8 / 100.8 = 1.98214
      await expect(pileToken.connect(alice).placeMarketIncrease(
        "ETHUST", 
        dollar(200), 
        dollar(100),  
        true
      )).to.be.ok;

      // (199.8 - 100)  / (99.8-51) = 2.045081
      await expect(pileToken.connect(alice).placeMarketDecrease(
        "ETHUST",
        dollar(100),
        dollar(75)
      )).to.be.revertedWith("Takepile: maximum leverage exceeded")
    });
  
    it("Show throw error if position decrease results in leftover collateral", async () => {

      expect(await underlyingToken.balanceOf(aliceAddr)).to.be.eq(0);
      expect(await pileToken.balanceOf(aliceAddr)).to.be.eq(dollar(1000));

      // allow alice to transfer alice's pileTokens
      await pileToken.connect(alice).approve(pileToken.address, dollar(1000));
      // Enter mock position and calculate reward
      await priceConsumer.setPrice(underlyingToken.address, 100);

      await expect(pileToken.connect(alice).placeMarketIncrease(
        "ETHUST", 
        dollar(200), 
        dollar(100),  
        true
      )).to.be.ok;

      await expect(pileToken.connect(alice).placeMarketDecrease(
        "ETHUST",
        dollar(200),
        dollar(99)
      )).to.be.revertedWith("Takepile: collateral leftover")
    });

    it("Show throw error if position decrease leaves some amount and no collateral", async () => {

      expect(await underlyingToken.balanceOf(aliceAddr)).to.be.eq(0);
      expect(await pileToken.balanceOf(aliceAddr)).to.be.eq(dollar(1000));

      // allow alice to transfer alice's pileTokens
      await pileToken.connect(alice).approve(pileToken.address, dollar(1000));
      // Enter mock position and calculate reward
      await priceConsumer.setPrice(underlyingToken.address, 100);

      await expect(pileToken.connect(alice).placeMarketIncrease(
        "ETHUST", 
        dollar(200), 
        dollar(100),  
        true
      )).to.be.ok;

      // (199.8 - 100)  / (99.8-51) = 2.045081
      await expect(pileToken.connect(alice).placeMarketDecrease(
        "ETHUST",
        dollar(199),
        dollar(100)
      )).to.be.revertedWith("Takepile: no collateral left")
    });

    it("Should allow adding collateral with no position size change", async () => {

      expect(await underlyingToken.balanceOf(aliceAddr)).to.be.eq(0);
      expect(await pileToken.balanceOf(aliceAddr)).to.be.eq(dollar(1000));

      // allow alice to transfer alice's pileTokens
      await pileToken.connect(alice).approve(pileToken.address, dollar(1000));
      // Enter mock position and calculate reward
      await priceConsumer.setPrice(underlyingToken.address, 100);

      await expect(pileToken.connect(alice).placeMarketIncrease(
        "ETHUST", 
        dollar(200), 
        dollar(100),  
        true
      )).to.be.ok;

      expect((await pileToken.positions(aliceAddr, 'ETHUST')).amount).to.be.eq(dollar(200));
      expect((await pileToken.positions(aliceAddr, 'ETHUST')).collateral).to.be.eq(dollar(100));

      await expect(await pileToken.connect(alice).placeMarketIncrease(
        "ETHUST",
        dollar(0),
        dollar(100),
        true
      )).to.be.ok;

      expect((await pileToken.positions(aliceAddr, 'ETHUST')).amount).to.be.eq(dollar(200));
      expect((await pileToken.positions(aliceAddr, 'ETHUST')).collateral).to.be.eq(dollar(200));

    });

    // Should not allow partial exit when within .5% of liquidation price

  });

});
