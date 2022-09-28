const { expect } = require("chai");
const { ethers } = require("hardhat");
const { utils, BigNumber } = require("ethers");

describe("TakepileToken", function () {
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

  before(async function () {
    [owner, alice, bob, charlie, treasury] = await ethers.getSigners();
    [aliceAddr, bobAddr, charlieAddr, treasuryAddr] = await Promise.all(
      [alice, bob, charlie, treasury].map((x) => x.getAddress())
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

    await driver.createTakepile(underlyingToken.address, "Takepile TestToken", "pileTEST", 1);
    pileToken = await ethers.getContractAt("TakepileToken", await driver.takepiles(0));

    const MockPriceConsumer = await ethers.getContractFactory("MockPriceConsumer");
    priceConsumer = await MockPriceConsumer.deploy();
    await priceConsumer.deployed();

    // Initial balances
    await underlyingToken.transfer(aliceAddr, 1000);
    await underlyingToken.transfer(bobAddr, 1000);
    await underlyingToken.transfer(charlieAddr, 1000);

    // Set initial token price
    await priceConsumer.setPrice(underlyingToken.address, 100);

    await driver.setTakepileDistributionRate(pileToken.address, "1522070015220700152");

    await driver.setTakepileFeeDivisors(pileToken.address, 4000, 2000, 4000, 2000);

    await driver.setTakepileAmountParameters(
      pileToken.address,
      1, // max position 100% of total supply
      0 // min position 0
    );
  });

  describe("Deployment", function () {
    it("Should initialize with correct total supply", async function () {
      const totalSupply = await pileToken.totalSupply();
      expect(totalSupply).to.equal(0);
    });
    it("Should initialize with correct takepile token name and symbol", async function () {
      const name = await pileToken.name();
      const symbol = await pileToken.symbol();
      expect(name).to.equal("Takepile TestToken");
      expect(symbol).to.equal("pileTEST");
    });
  });

  describe("Initial conversion rates", function () {
    it("Should correctly convert from underlying to shares", async function () {
      const conversion = await pileToken.getConversion(1000, 0);
      expect(conversion).to.equal(1000);
    });
    it("Should correctly convert from shares to underlying", async function () {
      const conversion = await pileToken.getConversion(0, 1000);
      expect(conversion).to.equal(1000);
    });
    it("Should revert if both values 0", async function () {
      await expect(pileToken.getConversion(0, 0)).to.be.revertedWith(
        "Takepile: one value should be non-zero"
      );
    });
    it("Should revert if both values not 0", async function () {
      await expect(pileToken.getConversion(10, 10)).to.be.revertedWith(
        "Takepile: one value should be zero"
      );
    });
  });

  describe("Initial Depositing", function () {
    it("Should mint 1000 tokens when supplying 1000 underlying", async function () {
      expect(await underlyingToken.balanceOf(aliceAddr)).to.be.eq(1000);
      await underlyingToken.connect(alice).approve(pileToken.address, 1000);
      // Deposit 1000 underlying token to receive 1000 pile token
      await pileToken.connect(alice).deposit(1000);
      expect(await underlyingToken.balanceOf(aliceAddr)).to.be.eq(0);
      expect(await pileToken.balanceOf(aliceAddr)).to.be.eq(1000);
    });
  });

  describe("Initial Withdrawing", function () {
    it("Should burn 1000 tokens when withdrawing 1000 underlying", async function () {
      await pileToken.connect(alice).withdraw(1000);
      expect(await pileToken.balanceOf(aliceAddr)).to.be.eq(0);
      expect(await underlyingToken.balanceOf(aliceAddr)).to.be.eq(1000);
    });
  });

  describe("Adding markets", function () {
    it("Should allow owner to add market", async function () {
      expect(await pileToken.addMarket("ETHUSD", priceConsumer.address, underlyingToken.address)).to
        .be.ok;
    });
    it("Should correctly fetch mock oracle price", async function () {
      expect(await pileToken.getLatestPrice("ETHUSD")).to.eq(100);
      await priceConsumer.setPrice(underlyingToken.address, 1000);
      expect(await pileToken.getLatestPrice("ETHUSD")).to.eq(1000);
    });
    it("Should not allow non-owner to add market", async function () {
      await expect(
        pileToken
          .connect(charlie)
          .addMarket("BTCUSD", priceConsumer.address, underlyingToken.address)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
    it("Should allow owner to remove market", async function () {
      expect(await pileToken.removeMarket("ETHUSD")).to.be.ok;
      expect(pileToken.removeMarket("ETHUSD")).to.be.revertedWith(
        "Takepile: market does not exist"
      );
    });
  });

  describe("Entering / Exiting positions", function () {
    it("Should have correct balances after mock position entries and exits", async function () {
      // add market
      expect(await pileToken.addMarket("ETHUST", priceConsumer.address, underlyingToken.address)).to
        .be.ok;

      await underlyingToken.connect(alice).approve(pileToken.address, 1000);

      // Deposit 1000 underlying token to receive 1000 pile token
      await pileToken.connect(alice).deposit(1000);

      expect(await underlyingToken.balanceOf(aliceAddr)).to.be.eq(0);
      expect(await pileToken.balanceOf(aliceAddr)).to.be.eq(1000);

      // allow pile to transfer alice's pile tokens
      await pileToken.connect(alice).approve(pileToken.address, 1000);

      // Enter mock position and calculate reward
      await priceConsumer.setPrice(underlyingToken.address, 100);
      expect(await pileToken.connect(alice).placeMarketIncrease("ETHUST", 100, 100, true)).to.be.ok;
      expect(await pileToken.balanceOf(aliceAddr)).to.be.eq(900);

      // -20% * 100 = -20
      await priceConsumer.setPrice(underlyingToken.address, 80);
      expect(await pileToken.connect(alice).placeMarketDecrease("ETHUST", 100, 100)).to.be.ok;
      expect(await pileToken.balanceOf(aliceAddr)).to.be.eq(980);

      await priceConsumer.setPrice(underlyingToken.address, 100);
      expect(await pileToken.connect(alice).placeMarketIncrease("ETHUST", 100, 100, true)).to.be.ok;
      expect(await pileToken.balanceOf(aliceAddr)).to.be.eq(880);

      // +40% * 100 = +40
      await priceConsumer.setPrice(underlyingToken.address, 140);
      expect(await pileToken.connect(alice).placeMarketDecrease("ETHUST", 100, 100)).to.be.ok;
      expect(await pileToken.balanceOf(aliceAddr)).to.be.eq(1020);

      await priceConsumer.setPrice(underlyingToken.address, 100);
      expect(await pileToken.connect(alice).placeMarketIncrease("ETHUST", 100, 100, false)).to.be
        .ok;
      expect(await pileToken.balanceOf(aliceAddr)).to.be.eq(920);

      // -20% * 100 = -20
      await priceConsumer.setPrice(underlyingToken.address, 120);
      expect(await pileToken.connect(alice).placeMarketDecrease("ETHUST", 100, 100)).to.be.ok;
      expect(await pileToken.balanceOf(aliceAddr)).to.be.eq(1000);
    });

    it("Should revert with appropriate errors", async () => {
      await expect(
        pileToken.connect(alice).placeMarketDecrease("ETHUST", 100, 100)
      ).to.be.revertedWith("Takepile: position does not exist");
      await expect(
        pileToken.connect(alice).placeMarketIncrease("ETHUST", 100000, 100000, true)
      ).to.be.revertedWith("Takepile: insufficient balance");
      await expect(
        pileToken.connect(alice).placeMarketIncrease("BTCUST", 100, 100, true)
      ).to.be.revertedWith("Takepile: market does not exist");
    });

    it("Should allow adding to existing long positions", async () => {
      await priceConsumer.setPrice(underlyingToken.address, 100);

      expect(await pileToken.connect(alice).placeMarketIncrease("ETHUST", 100, 100, true)).to.be.ok;
      let position = await pileToken.positions(aliceAddr, "ETHUST");
      expect(position.amount).to.be.eq(100);

      expect(await pileToken.connect(alice).placeMarketIncrease("ETHUST", 100, 100, true)).to.be.ok;
      position = await pileToken.positions(aliceAddr, "ETHUST");
      expect(position.amount).to.be.eq(200);
      expect(position.price).to.be.eq(100);

      await priceConsumer.setPrice(underlyingToken.address, 50);
      expect(await pileToken.connect(alice).placeMarketIncrease("ETHUST", 100, 100, true)).to.be.ok;
      position = await pileToken.positions(aliceAddr, "ETHUST");
      expect(position.amount).to.be.eq(300);
      expect(position.price).to.be.eq(83);
    });

    it("Should not allow adding position with conflicting direction", async () => {
      await expect(
        pileToken.connect(alice).placeMarketIncrease("ETHUST", 100, 100, false)
      ).to.be.revertedWith("Takepile: conflicting directions");
    });
  });

  describe("Limit orders", function () {
    it("Should not not allow limit order if it would trigger immediately", async function () {
      await priceConsumer.setPrice(underlyingToken.address, 100);

      // Check bob balance
      expect(await underlyingToken.balanceOf(bobAddr)).to.be.eq(1000);
      expect(await underlyingToken.connect(bob).approve(pileToken.address, 1000)).to.be.ok;
      expect(await pileToken.connect(bob).deposit(1000)).to.be.ok;
      expect(await pileToken.balanceOf(bobAddr)).to.be.eq(1000);

      expect(await pileToken.addMarket("ETHUSD", priceConsumer.address, underlyingToken.address)).to
        .be.ok;
      expect(await pileToken.connect(bob).approve(pileToken.address, 1000)).to.be.ok;

      expect(await pileToken.getLatestPrice("ETHUSD")).to.eq(100);

      await expect(
        pileToken
          .connect(bob)
          .placeLimitIncrease(
            "ETHUSD",
            1000,
            1000,
            true,
            101,
            (await ethers.provider.getBlock()).timestamp + 60
          )
      ).to.be.revertedWith("Takepile: long order would trigger immediately");
    });

    it("Should prevent limit order if deadline expired", async function () {
      await expect(
        pileToken
          .connect(bob)
          .placeLimitIncrease(
            "ETHUSD",
            1000,
            1000,
            true,
            101,
            (await ethers.provider.getBlock()).timestamp - 60
          )
      ).to.be.revertedWith("Takepile: order expired");
    });

    it("Should allow limit order", async function () {
      expect(await pileToken.balanceOf(bobAddr)).to.be.eq(1000);
      const deadline = (await ethers.provider.getBlock()).timestamp + 60;
      await expect(
        pileToken.connect(bob).placeLimitIncrease("ETHUSD", 1000, 1000, true, 50, deadline)
      )
        .to.emit(pileToken, "LimitOrderSubmitted")
        .withArgs(bob.address, "ETHUSD", 1000, 1000, true, 50, 0, 0, deadline);
      expect(await pileToken.balanceOf(bobAddr)).to.be.eq(0);
    });

    it("Should not allow trigger if order does not exist", async function () {
      await expect(
        pileToken.connect(alice).triggerLimitOrder(bob.address, "BTCUSD", 0)
      ).to.be.revertedWith("Takepile: order does not exist");
    });

    it("Should not allow trigger if criteria not satisfied", async function () {
      await expect(
        pileToken.connect(alice).triggerLimitOrder(bob.address, "ETHUSD", 0)
      ).to.be.revertedWith("Takepile: conditions not satisfied");
    });

    it("Should allow order trigger when market at limit price", async function () {
      await priceConsumer.setPrice(underlyingToken.address, 50);
      expect((await pileToken.limitOrders(bob.address, "ETHUSD", 0)).amount).to.be.eq(1000);

      await expect(pileToken.connect(alice).triggerLimitOrder(bob.address, "ETHUSD", 0)).to.be.ok;
      expect((await pileToken.positions(bob.address, "ETHUSD")).amount).to.be.eq(1000);
      expect(await pileToken.balanceOf(bobAddr)).to.be.eq(0);
    });

    it("Show not allow triggering same order again", async function () {
      await expect(
        pileToken.connect(alice).triggerLimitOrder(bob.address, "ETHUSD", 0)
      ).to.be.revertedWith("Takepile: order inactive");
    });

    it("Should not allow a limit close order if would trigger immediately", async function () {
      await expect(
        pileToken
          .connect(bob)
          .placeLimitDecrease(
            "ETHUSD",
            1000,
            1000,
            40,
            45,
            (await ethers.provider.getBlock()).timestamp + 60
          )
      ).to.be.revertedWith("Takepile: order would trigger immediately");
    });

    it("Should allow a limit close order", async function () {
      await priceConsumer.setPrice(underlyingToken.address, 50);
      await expect(
        pileToken
          .connect(bob)
          .placeLimitDecrease(
            "ETHUSD",
            500,
            500,
            45,
            55,
            (await ethers.provider.getBlock()).timestamp + 60
          )
      ).to.be.ok;
      expect((await pileToken.limitOrders(bob.address, "ETHUSD", 1)).amount).to.be.eq(500);
      expect((await pileToken.limitOrders(bob.address, "ETHUSD", 1)).isIncrease).to.be.eq(false);
    });

    it("Should not allow trigger if criteria not satisfied", async function () {
      await expect(
        pileToken.connect(alice).triggerLimitOrder(bob.address, "ETHUSD", 1)
      ).to.be.revertedWith("Takepile: conditions not satisfied");
    });

    it("Should trigger a limit close order", async function () {
      await priceConsumer.setPrice(underlyingToken.address, 45);

      await expect(await pileToken.connect(alice).triggerLimitOrder(bob.address, "ETHUSD", 1)).to.be
        .ok;

      expect((await pileToken.positions(bob.address, "ETHUSD")).amount).to.be.eq(500);
      expect((await pileToken.limitOrders(bob.address, "ETHUSD", 1)).isActive).to.be.eq(false);
      expect(await pileToken.balanceOf(bobAddr)).to.be.eq(450); // - 10%
    });

    it("Can place two limit decrease orders on same symbol", async function () {
      await priceConsumer.setPrice(underlyingToken.address, 50);
      await expect(
        pileToken
          .connect(bob)
          .placeLimitDecrease(
            "ETHUSD",
            250,
            250,
            45,
            55,
            (await ethers.provider.getBlock()).timestamp + 60
          )
      ).to.be.ok;
      await expect(
        pileToken
          .connect(bob)
          .placeLimitDecrease(
            "ETHUSD",
            250,
            250,
            45,
            55,
            (await ethers.provider.getBlock()).timestamp + 60
          )
      ).to.be.ok;
      expect(await pileToken.balanceOf(bobAddr)).to.be.eq(450);
    });

    it("Should take index price to calculate reward", async function () {
      await priceConsumer.setPrice(underlyingToken.address, 55);

      await expect(await pileToken.connect(alice).triggerLimitOrder(bob.address, "ETHUSD", 2)).to.be
        .ok;
      expect(await pileToken.balanceOf(bobAddr)).to.be.eq(725); // 450+(250+25)

      await priceConsumer.setPrice(underlyingToken.address, 45);

      await expect(await pileToken.connect(alice).triggerLimitOrder(bob.address, "ETHUSD", 3)).to.be
        .ok;
      expect(await pileToken.balanceOf(bobAddr)).to.be.eq(950); // 725 + (250-25)
    });

    it("Should revert with invalid position amount", async function () {
      await driver.setTakepileAmountParameters(
        pileToken.address,
        1, // max position 100% of total supply
        ethers.utils.parseUnits("1", 18) // min position 1e18
      );

      await expect(
        pileToken.connect(alice).placeMarketIncrease("ETHUSD", 100, 100, true)
      ).to.be.revertedWith("Takepile: position amount below minimum");

      // set min position to 10 wei
      await driver.setTakepileAmountParameters(
        pileToken.address,
        1, // max position 100% of total supply
        "10" // min position 10
      );
    });
  });
  describe("Minimum position duration", function () {
    it("Should allow setting minimum duration", async function () {
      expect(await driver.setTakepileMinimumDuration(pileToken.address, 60 * 15)).to.be.ok;
    });

    it("Should not receive rewards if position duration less than minimum", async function () {
      await priceConsumer.setPrice(underlyingToken.address, 100);

      let preBalance = await pileToken.balanceOf(aliceAddr);
      expect(await pileToken.connect(alice).placeMarketIncrease("ETHUSD", 100, 100, true)).to.be.ok;
      await priceConsumer.setPrice(underlyingToken.address, 150);
      expect(await pileToken.connect(alice).placeMarketDecrease("ETHUSD", 100, 100)).to.be.ok;

      // Post balance should be equal to pre balance, since rewards are cancelled
      let postBalance = await pileToken.balanceOf(aliceAddr);
      expect(preBalance).to.be.eq(postBalance);
    });

    it("Should still accrue loss, even if position decreased before minimum duration", async function () {
      await priceConsumer.setPrice(underlyingToken.address, 100);

      let preBalance = await pileToken.balanceOf(aliceAddr);
      expect(await pileToken.connect(alice).placeMarketIncrease("ETHUSD", 100, 100, true)).to.be.ok;
      await priceConsumer.setPrice(underlyingToken.address, 50);
      expect(await pileToken.connect(alice).placeMarketDecrease("ETHUSD", 100, 100)).to.be.ok;

      let postBalance = await pileToken.balanceOf(aliceAddr);
      expect(preBalance).to.be.eq(postBalance.add(50));
    });
  });
});
