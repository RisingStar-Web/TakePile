const { expect } = require("chai");
const { ethers } = require("hardhat");

const moveBlocks = require("./utils/move-blocks");
const moveTime = require("./utils/move-time");

describe("TakepilePresale", function () {
  let owner, alice, bob;
  let take, usdc, presale;

  before(async function () {
    [owner, alice, bob] = await ethers.getSigners();

    const Take = await ethers.getContractFactory("Take");
    take = await Take.deploy();
    await take.deployed();

    const TestToken = await ethers.getContractFactory("TestToken");
    usdc = await TestToken.deploy('USD Coin', 'USDC', ethers.utils.parseUnits('100000', 18));
    await usdc.deployed();

    const decimals = await usdc.decimals();

    const TakePresale = await ethers.getContractFactory("TakePresale");
    presale = await TakePresale.deploy(
      ethers.utils.parseUnits('.5', decimals),
      ethers.utils.parseUnits('3000', 18),
      usdc.address,
      take.address
    );
    await presale.deployed();

    await usdc.transfer(alice.getAddress(), ethers.utils.parseUnits('10000', 18));
    await usdc.transfer(bob.getAddress(), ethers.utils.parseUnits('10000', 18));

    // Fund presale contract
    await take.transfer(presale.address, ethers.utils.parseUnits('300000', 18));

  });

  describe("TAKE Deployment", function () {
    it("Should initialize with correct total supply", async function () {
      const totalSupply = await take.totalSupply();
      expect(totalSupply).to.equal(ethers.utils.parseUnits('10000000', 18));
    });
  });

  describe("Presale Round 1", function () {
    it("Should have correct TAKE price", async function () {
      const price = await presale.TAKE_PRICE();
      expect(price).to.equal(ethers.utils.parseUnits('.5', 18));
    });
    it("Should have correct TAKE max buy", async function () {
      const price = await presale.TAKE_MAX_BUY();
      expect(price).to.equal(ethers.utils.parseUnits('3000', 18));
    });
    it("Should not allow purchase while paused", async function () {
      await expect(presale.connect(alice).buy(ethers.utils.parseUnits('3000'))).to.be.revertedWith('Pausable: paused');
    });
    it("Should allow owner to set presale start/end times", async function () {
      const startTime = Math.floor(new Date().getTime() / 1000 + 60 * 60); // in one hour
      const endTime = Math.floor(new Date().getTime() / 1000 + 60 * 60 * 2); // in two hours
      expect(await presale.setPresaleDuration(startTime, endTime)).to.be.ok;
    });
    it("Should allow owner to unpause", async function () {
      expect(await presale.unpause()).to.be.ok;
    });
    it("Should not allow purchase before presale is started", async function () {
      await expect(presale.connect(alice).buy(ethers.utils.parseUnits('3000'))).to.be.revertedWith('Presale has not started');
    });

    it("Should allow alice to purchase after presale is started", async function () {
      await moveTime(60 * 60);
      const purchaseAmount = ethers.utils.parseUnits('2000');

      // Pre balance check
      expect(await usdc.balanceOf(alice.getAddress())).to.be.eq(ethers.utils.parseUnits('10000', 18));
      expect(await take.balanceOf(alice.getAddress())).to.be.eq(0);

      // Give presale contract permission to transfer USDC
      await usdc.connect(alice).approve(presale.address, purchaseAmount)

      // Make presale purchase
      expect(await presale.connect(alice).buy(purchaseAmount)).to.be.ok;

      // Post balance check
      expect(await take.balanceOf(alice.getAddress())).to.be.eq(purchaseAmount);
      expect(await usdc.balanceOf(alice.getAddress())).to.be.eq(ethers.utils.parseUnits('9000', 18));
    });

    it("Should allow alice another purchase if max buy not exceeded", async function () {
      const purchaseAmount = ethers.utils.parseUnits('1000');

      await usdc.connect(alice).approve(presale.address, purchaseAmount)
      expect(await presale.connect(alice).buy(purchaseAmount)).to.be.ok;

      expect(await take.balanceOf(alice.getAddress())).to.be.eq(ethers.utils.parseUnits('3000'));
      expect(await usdc.balanceOf(alice.getAddress())).to.be.eq(ethers.utils.parseUnits('8500', 18));
    });

    it("Should not allow alice another purchase if max buy exceeded", async function () {
      const purchaseAmount = ethers.utils.parseUnits('1');
      await usdc.connect(alice).approve(presale.address, purchaseAmount)
      await expect(presale.connect(alice).buy(purchaseAmount)).to.be.revertedWith('Purchase exceeds max buy amount')
    });

    it("Should allow bob to purchase", async function () {
      const purchaseAmount = ethers.utils.parseUnits('3000');

      // Pre balance check
      expect(await usdc.balanceOf(bob.getAddress())).to.be.eq(ethers.utils.parseUnits('10000', 18));
      expect(await take.balanceOf(bob.getAddress())).to.be.eq(0);

      // Give presale contract permission to transfer USDC
      await usdc.connect(bob).approve(presale.address, purchaseAmount)

      // Make presale purchase
      expect(await presale.connect(bob).buy(purchaseAmount)).to.be.ok;

      // Post balance check
      expect(await take.balanceOf(bob.getAddress())).to.be.eq(purchaseAmount);
      expect(await usdc.balanceOf(bob.getAddress())).to.be.eq(ethers.utils.parseUnits('8500', 18));
    });

    it("Should not allow owner to withdraw before presale has ended", async function () {
      await expect(presale.withdraw(owner.getAddress())).to.be.revertedWith("Presale has not ended");
    });

    it("Should allow owner to withdraw after presale has ended", async function () {
      await moveTime(60 * 60);
      expect(await presale.withdraw(owner.getAddress())).to.be.ok;

      expect(await take.balanceOf(owner.getAddress())).to.be.eq(ethers.utils.parseUnits('9994000'));
    });

  });

});