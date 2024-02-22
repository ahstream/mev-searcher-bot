// This is a basic Example of a Seeker Bot
// For Educational Purpose: Only a Specific contract is targeted, remember Ethereum is
// a dark forest and alot of these predators wander there with alot more ability
// than this little fellow

require('dotenv').config();

// 1. Setup ethers, required variables, contracts and start function
const { Wallet, ethers } = require('ethers');
const { FlashbotsBundleProvider, FlashbotsBundleResolution } = require('@flashbots/ethers-provider-bundle');

// 1. Setup Providers and Wallets
// Setup user modifiable variables
//const flashbotsUrl = 'https://relay-goerli.flashbots.net';
const flashbotsUrl = 'https://relay-sepolia.flashbots.net';

// Copy Pvt key from Metamask and paste here
const privateKey = process.env['0x7aC936540762549820186CBeEF1e2356BB2A64ea'];

//* Setup Contract to Watch
// ? Normally the bot will scan every Transaction & Contract but due to limited resources we know our target
//const targetContractAddress = '0xaf28e26603bcbb1d25cd23b717d3e7e260be8fd0';
const targetContractAddress = '0x934492fe5deC6386775f63446489Ff7D6D509579';

// Chain Goerli
//const chainId = 5;
const chainId = 11155111;
const networkName = 'sepolia';

// Initialize Providers
const provider = new ethers.providers.JsonRpcProvider(process.env.INFURA_SEPOLIA_HTTP);
const wsProvider = new ethers.providers.WebSocketProvider(process.env.INFURA_SEPOLIA_WSS);
console.log(wsProvider);

// Setup Signer Wallet for Bot
const signingWallet = new ethers.Wallet(privateKey, provider);

// 2. Process the Transaction to see if we should frontrun it
const processTransaction = async (txHash, flashbotsProvider) => {
  let tx = null;

  // * 3. Check if someone called our targeted Smart Contract
  try {
    tx = await provider.getTransaction(txHash);
    console.log(tx?.to);
    // console.log(transaction)

    if (tx.to.toLowerCase() == targetContractAddress.toLowerCase()) {
      console.log('Someone intetracted with our target contract');
      console.log(tx);
    } else {
      return false;
    }
  } catch (err) {
    return false;
  }

  // 4. Get fee costs for simplicity we'll add the user's gas fee

  // 6. Get fee costs for simplicity we'll add the user's gas fee
  const bribeToMiners = ethers.utils.parseUnits('5000', 'gwei');
  const maxGasFee = tx.maxFeePerGas ? tx.maxFeePerGas.add(bribeToMiners) : bribeToMiners;
  const priorityFee = tx.maxPriorityFeePerGas ? tx.maxPriorityFeePerGas.add(bribeToMiners) : bribeToMiners;

  const totalGasFee = maxGasFee.add(priorityFee);

  console.log('tx.maxFeePerGas', tx.maxFeePerGas);
  console.log('tx.maxPriorityFeePerGas', tx.maxPriorityFeePerGas);
  console.log('maxGasFee', maxGasFee);
  console.log('priorityFee', priorityFee);
  console.log('totalGasFee', totalGasFee);
  console.log('totalGasFee eth', ethers.utils.formatEther(totalGasFee));

  console.log("Copying Sender's Transaction");

  // Construct the transaction parameters for copying
  const copiedTransaction = {
    to: tx.to,
    value: tx.value,
    data: tx.data,
    gasPrice: totalGasFee,
    gasLimit: 40000, // Set the gas price including bribe
    nonce: await provider.getTransactionCount(signingWallet.address, 'latest'), // Get the next nonce
    chainId: tx.chainId,
  };

  // * Build your transaction
  let firstTransaction = {
    signer: signingWallet,
    transaction: copiedTransaction,
  };
  firstTransaction.transaction = {
    ...firstTransaction.transaction,
    chainId,
  };

  console.log('Creating Tx Array');
  const transactionsArray = [firstTransaction];

  console.log('signing Transaction');
  const signedTransactions = await flashbotsProvider.signBundle(transactionsArray);
  console.log('signedTransactions', signedTransactions);

  console.log('Getting Block Number');
  const blockNumber = await provider.getBlockNumber();

  // Simulate and send transactions
  console.log('Simulating...');
  const simulation = await flashbotsProvider.simulate(signedTransactions, blockNumber + 1);

  if (simulation.firstRevert) {
    return console.log('Simulation error', simulation.firstRevert);
  } else {
    console.log('Simulation success', simulation);
    console.log('sim gasFees', ethers.utils.formatEther(simulation.gasFees));
  }

  const response = await flashbotsProvider.sendPrivateTransaction(signedTransactions[0], { maxBlockNumber: blockNumber + 55 });
  const result = await response.wait();
  console.log('result', result);
  if (result) {
    return;
  }

  // Send transactions with flashbots
  let bundleSubmission;
  flashbotsProvider
    .sendRawBundle(signedTransactions, blockNumber + 1)
    .then((_bundleSubmission) => {
      bundleSubmission = _bundleSubmission;
      console.log('Bundle submitted', bundleSubmission.bundleHash);
      return bundleSubmission.wait();
    })
    .then(async (waitResponse) => {
      console.log('Wait response', FlashbotsBundleResolution[waitResponse]);
      if (waitResponse == FlashbotsBundleResolution.BundleIncluded) {
        console.log('-------------------------------------------');
        console.log('-------------------------------------------');
        console.log('----------- Bundle Included ---------------');
        console.log('-------------------------------------------');
        console.log('-------------------------------------------');
      } else if (waitResponse == FlashbotsBundleResolution.AccountNonceTooHigh) {
        console.log('The transaction has been confirmed already');
      } else {
        console.log('Bundle hash', bundleSubmission.bundleHash);
        try {
          console.log({
            bundleStats: await flashbotsProvider.getBundleStats(bundleSubmission.bundleHash, blockNumber + 1),
            userStats: await flashbotsProvider.getUserStats(),
          });
        } catch (e) {
          return false;
        }
      }
    });
};

// 3. Start Listening for pending transactions
const start = async () => {
  console.log('Listening on transaction for the chain id', chainId);

  console.log('Creating FLashboat Provider');
  //const flashbotsProvider2 = await FlashbotsBundleProvider.create(provider, signingWallet, flashbotsUrl, networkName);
  const flashbotsProvider = await FlashbotsBundleProvider.create(provider, signingWallet, flashbotsUrl, networkName);

  //const flashbotsProvider = await FlashbotsBundleProvider.create(provider, signingWallet, 'https://relay-sepolia.flashbots.net', networkName);

  // Listen to all transactions in the mempool
  // ? With a status = Pending
  wsProvider.on('pending', (tx) => {
    processTransaction(tx, flashbotsProvider);
  });
};

start();
