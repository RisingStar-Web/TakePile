const { expect } = require("chai");
const { ethers, hre } = require("hardhat");
const { utils, BigNumber } = require('ethers');

describe("xTake", function () {
  let underlyingToken,
    takeToken,
    xTake,
    takepileFactory,
    xTakeFactory,
    driver,
    pileToken,
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
    underlyingToken = await TestToken.deploy("TestToken", "TEST", 100000000);
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
    pileToken = await ethers.getContractAt(
      "TakepileToken",
      await driver.takepiles(0)
    );

    await driver.setTakepileFeeDivisors(
      pileToken.address,
      4000,
      2000,
      4000,
      2000
    );

    const MockPriceConsumer = await ethers.getContractFactory(
      "MockPriceConsumer"
    );
    priceConsumer = await MockPriceConsumer.deploy();
    await priceConsumer.deployed();

    const XTake = await ethers.getContractFactory("xTake");
    xTake = await XTake.deploy(takeToken.address, pileToken.address, "pileTEST");
    await xTake.deployed();

    // Initial balances
    await underlyingToken.transfer(aliceAddr, 1000000);
    await underlyingToken.transfer(bobAddr, 1000000);
    await underlyingToken.transfer(charlieAddr, 1000000);

    await takeToken.transfer(aliceAddr, 1000);
    await takeToken.transfer(bobAddr, 1000);
    await takeToken.transfer(charlieAddr, 1000);

    await underlyingToken.approve(pileToken.address, 1000);
    await pileToken.deposit(1000);

    // Set initial token price
    await priceConsumer.setPrice(underlyingToken.address, 100);

  });

  describe("Deployment", function () {
    it("Should initialize with correct name and symbol", async function () {
      expect(await xTake.name()).to.be.eq("xTAKE (pileTEST)");
      expect(await xTake.symbol()).to.be.eq("xTAKE (pileTEST)");
    });
    it("Should initialize with 0 total supply", async function () {
      expect(await xTake.totalSupply()).to.be.eq(0);
    });
  });

  describe("Staking", function () {
    it("Should revert with insufficient allowance", async function () {
      await expect(xTake.connect(alice).stake(1000)).to.be.revertedWith('ERC20: insufficient allowance');
    });
    it("Should revert with insufficient balance", async function () {
      await takeToken.connect(alice).approve(xTake.address, 10000);
      await expect(xTake.connect(alice).stake(1001)).to.be.revertedWith('ERC20: transfer amount exceeds balance');
      expect(await takeToken.balanceOf(aliceAddr)).to.be.eq(1000);
    });
    it("Should mint equivalent amount of xTAKE", async function () {
      expect(await takeToken.balanceOf(bobAddr)).to.be.eq(1000);

      expect(await takeToken.connect(bob).approve(xTake.address, 1000)).to.be.ok;
      await expect( await xTake.connect(bob).stake(1000)).to.be.ok;

      expect(await xTake.totalSupply()).to.be.eq(1000);
      expect(await xTake.balanceOf(bob.address)).to.be.eq(1000);
      expect(await takeToken.balanceOf(bob.address)).to.be.eq(0);
    });
  });

  describe("Unstaking", function () {
    it("Should revert if insufficient stake balance", async function () {
      await expect(xTake.connect(bob).unstake(1001)).to.be.revertedWith('ERC20: burn amount exceeds balance');
      expect(await xTake.balanceOf(bob.address)).to.be.eq(1000);
      expect(await takeToken.balanceOf(bob.address)).to.be.eq(0);
    });
    it("Should unstake successfully", async function () {
      await xTake.connect(bob).approve(xTake.address, 1000);
      await expect(await xTake.connect(bob).unstake(900)).to.be.ok;
      expect(await takeToken.balanceOf(bob.address)).to.be.eq(900); 
      expect(await xTake.balanceOf(bob.address)).to.be.eq(100); 
      expect(await xTake.totalSupply()).to.be.eq(100);
    });
  });

  describe("Distributing", function () {
    it("Should give Bob the full distribution when he's the only staker", async function () {
      expect(await pileToken.balanceOf(owner.address)).to.be.eq(1000); 
      await pileToken.approve(xTake.address, 100);
      await expect(await xTake.distribute(100)).to.be.ok;
      expect(await pileToken.balanceOf(owner.address)).to.be.eq(900); 
      expect(await xTake.claimable(bob.address)).to.be.eq(100); 
      expect(await pileToken.balanceOf(bob.address)).to.be.eq(0); 
    });
    it("Should split distribution between Bob and Charlie", async function () {
      
      expect(await takeToken.connect(charlie).approve(xTake.address, 100)).to.be.ok;
      await expect( await xTake.connect(charlie).stake(100)).to.be.ok;
      
      expect(await xTake.balanceOf(bob.address)).to.be.eq(100); 
      expect(await xTake.balanceOf(charlie.address)).to.be.eq(100); 
      expect(await xTake.totalSupply()).to.be.eq(200);

      await pileToken.approve(xTake.address, 100);
      await expect(await xTake.distribute(100)).to.be.ok;

      expect(await xTake.claimable(bob.address)).to.be.eq(150); 
      expect(await xTake.claimable(charlie.address)).to.be.eq(50); 
    });
  });

  describe("Claiming", async function () {
    it('Should revert if not enought to claim', async function () {
      await expect(xTake.connect(bob).claim(151)).to.revertedWith('xTAKE: insufficient claim balance');
    });
    it('Should allow claim', async function () {
      expect(await xTake.connect(bob).claim(100)).to.be.ok; 
      expect(await pileToken.balanceOf(bob.address)).to.be.eq(100); 
      expect(await xTake.claimable(bob.address)).to.be.eq(50); 
    });
    it("Should not be affected by transfers", async function () {
      expect(await xTake.connect(bob).transfer(charlie.address, 100)).to.be.ok; 
      expect(await xTake.balanceOf(bob.address)).to.be.eq(0); 
      expect(await xTake.balanceOf(charlie.address)).to.be.eq(200); 
      expect(await xTake.claimable(bob.address)).to.be.eq(50); 
      expect(await xTake.claimable(charlie.address)).to.be.eq(50); 
    });
  });

  describe("Distribution", async function () {
    it("Should setup for distribution", async function () {
      expect(
        await pileToken.addMarket(
          "ETHUST",
          priceConsumer.address,
          underlyingToken.address
        )
      ).to.be.ok;

      expect(await pileToken.balanceOf(aliceAddr)).to.be.eq(0);
      expect(await underlyingToken.balanceOf(aliceAddr)).to.be.eq(1000000);

      await underlyingToken.connect(alice).approve(pileToken.address, 100000);
      await pileToken.connect(alice).deposit(100000);

      expect(await pileToken.balanceOf(aliceAddr)).to.be.eq(100000);
    });

  });

  describe("Distribution on position entry", async function () {
    it("Should distribute fees on position open", async function () {

      // Get xTake contract deployed with pileToken
      xTake = await ethers.getContractAt(
        "xTake",
        await pileToken.distributor()
      );

      expect(await xTake.totalSupply()).to.be.eq(0); 
      expect(await xTake.balanceOf(charlieAddr)).to.be.eq(0);
      expect(await pileToken.balanceOf(charlieAddr)).to.be.eq(0);
      expect(await underlyingToken.balanceOf(charlieAddr)).to.be.eq(1000000);

      // Deposit and stake as charlie
      await underlyingToken.connect(charlie).approve(pileToken.address, 100000);
      await pileToken.connect(charlie).deposit(100000);
      await takeToken.connect(charlie).approve(xTake.address, 10000);
      await expect(xTake.connect(charlie).stake(100)).to.be.ok;

      // Double check charlie
      expect(await pileToken.balanceOf(charlieAddr)).to.be.eq(100000);
      expect(await underlyingToken.balanceOf(charlieAddr)).to.be.eq(900000);
      expect(await xTake.balanceOf(charlieAddr)).to.be.eq(100);
      expect(await xTake.claimable(charlieAddr)).to.be.eq(0);

      // Enter position with alice
      expect(await pileToken.balanceOf(aliceAddr)).to.be.eq(100000);
      await pileToken.connect(alice).approve(pileToken.address, 100000);
      expect(await pileToken.connect(alice).placeMarketIncrease('ETHUST', 100000, 100000, true)).to.be.ok;
      expect(await pileToken.balanceOf(aliceAddr)).to.be.eq(0);

      const position = await pileToken.positions(aliceAddr, 'ETHUST');
      expect(position.symbol).to.be.eq('ETHUST');
      expect(position.amount).to.be.eq(99900);
      expect(position.collateral).to.be.eq(99900);

      // 100 * .25%
      expect(await xTake.claimable(charlieAddr)).to.be.eq(25);

      expect(await pileToken.connect(alice).placeMarketDecrease('ETHUST', 99900, 99900)).to.be.ok;
      expect(await pileToken.balanceOf(aliceAddr)).to.be.eq(99803); // 100,000 - (2*99);

    });    

    it("Should split distribution fees on position open", async function () {

      await takeToken.connect(bob).approve(xTake.address, 10000);
      await expect(xTake.connect(bob).stake(100)).to.be.ok;
    
      expect(await xTake.claimable(charlieAddr)).to.be.eq(49);

      // Deposit and enter position with Alice
      await underlyingToken.connect(alice).approve(pileToken.address, 1000000);
      await pileToken.connect(alice).deposit(100000);
      await pileToken.connect(alice).approve(pileToken.address, 100000);
      expect(await pileToken.connect(alice).placeMarketIncrease('ETHUST', 100000, 100000, true)).to.be.ok;

      // Bob and Charlie each have 50% of the total xTake supply, so split 33 / 2 = 16 wei
      expect(await xTake.claimable(charlieAddr)).to.be.eq(61);
      expect(await xTake.claimable(bobAddr)).to.be.eq(12);

    });
  })
});
