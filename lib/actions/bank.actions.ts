/* eslint-disable @typescript-eslint/no-explicit-any */
"use server";

import { CountryCode } from "plaid";

import { plaidClient } from "../plaid";
import { parseStringify } from "../utils";

import { getTransactionsByBankId } from "./transaction.actions";
import { getBanks, getBank } from "./user.actions";

// Get item info (for institution_id)
const getItemInfo = async (accessToken: string) => {
  const itemResponse = await plaidClient.itemGet({ access_token: accessToken });
  return itemResponse.data.item;
};

// Get multiple bank accounts
export const getAccounts = async ({ userId }: getAccountsProps) => {
  try {
    // get banks from db
    const banks = await getBanks({ userId });

    const accounts = await Promise.all(
      banks?.map(async (bank: Bank) => {
        // get each account info from plaid
        const accountsResponse = await plaidClient.accountsGet({
          access_token: bank.accessToken,
        });
        const accountData = accountsResponse.data.accounts[0];

        // get institution info from plaid
        const item = await getItemInfo(bank.accessToken);
        const institution = await getInstitution({
          institutionId: item.institution_id!,
        });

        const account = {
          id: accountData.account_id,
          availableBalance: accountData.balances.available!,
          currentBalance: accountData.balances.current!,
          institutionId: institution.institution_id,
          name: accountData.name,
          officialName: accountData.official_name,
          mask: accountData.mask!,
          type: accountData.type as string,
          subtype: accountData.subtype! as string,
          appwriteItemId: bank.$id,
          shareableId: bank.shareableId,
        };

        return account;
      })
    );

    const totalBanks = accounts.length;
    const totalCurrentBalance = accounts.reduce((total, account) => {
      return total + account.currentBalance;
    }, 0);

    return parseStringify({ data: accounts, totalBanks, totalCurrentBalance });
  } catch (error) {
    console.error("An error occurred while getting the accounts:", error);
  }
};

// Get one bank account
export const getAccount = async ({ appwriteItemId }: getAccountProps) => {
  try {
    // get bank from db
    const bank = await getBank({ documentId: appwriteItemId });

    // get account info from plaid
    const accountsResponse = await plaidClient.accountsGet({
      access_token: bank.accessToken,
    });
    const accountData = accountsResponse.data.accounts[0];

    // get transfer transactions from appwrite
    const transferTransactionsData = await getTransactionsByBankId({
      bankId: bank.$id,
    });

    const transferTransactions = transferTransactionsData.documents.map(
      (transferData: Transaction) => ({
        id: transferData.$id,
        name: transferData.name!,
        amount: transferData.amount!,
        date: transferData.$createdAt,
        paymentChannel: transferData.channel,
        category: transferData.category,
        type: transferData.senderBankId === bank.$id ? "debit" : "credit",
      })
    );

    // get institution info from plaid
    const item = await getItemInfo(bank.accessToken);
    const institution = await getInstitution({
      institutionId: item.institution_id!,
    });

    const transactions = await getTransactions({
      accessToken: bank?.accessToken,
    });

    const account = {
      id: accountData.account_id,
      availableBalance: accountData.balances.available!,
      currentBalance: accountData.balances.current!,
      institutionId: institution.institution_id,
      name: accountData.name,
      officialName: accountData.official_name,
      mask: accountData.mask!,
      type: accountData.type as string,
      subtype: accountData.subtype! as string,
      appwriteItemId: bank.$id,
    };

    // sort transactions by date such that the most recent transaction is first
    const allTransactions = [...transactions, ...transferTransactions].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );

    return parseStringify({
      data: account,
      transactions: allTransactions,
    });
  } catch (error) {
    console.error("An error occurred while getting the account:", error);
  }
};

// Get bank info
export const getInstitution = async ({
  institutionId,
}: getInstitutionProps) => {
  try {
    const institutionResponse = await plaidClient.institutionsGetById({
      institution_id: institutionId,
      country_codes: ["US"] as CountryCode[],
    });

    const intitution = institutionResponse.data.institution;

    return parseStringify(intitution);
  } catch (error) {
    console.error("An error occurred while getting the accounts:", error);
  }
};

// Get transactions
const useMockData = true;

export const getTransactions = async (accessToken: string) => {
  if (useMockData) {
    return [
      {
        transaction_id: "txn_001",
        name: "Starbucks",
        amount: 4.5,
        date: "2025-05-15",
        category: ["Food", "Coffee"],
        merchant_name: "Starbucks",
      },
      {
        transaction_id: "txn_002",
        name: "Amazon",
        amount: 89.99,
        date: "2025-05-14",
        category: ["Shopping", "Online"],
        merchant_name: "Amazon",
      },
      {
        transaction_id: "txn_003",
        name: "Uber",
        amount: 15.75,
        date: "2025-05-13",
        category: ["Transport"],
        merchant_name: "Uber",
      },
      {
        transaction_id: "txn_004",
        name: "Zara",
        amount: 749.99,
        date: "2025-05-13",
        category: ["Shopping", "Clothing"],
        merchant_name: "Zara",
      },
      {
        transaction_id: "txn_005",
        name: "Netflix",
        amount: 15.99,
        date: "2025-05-12",
        category: ["Entertainment"],
        merchant_name: "Netflix",
      },
      {
        transaction_id: "txn_006",
        name: "Spotify",
        amount: 9.99,
        date: "2025-05-11",
        category: ["Entertainment"],
        merchant_name: "Spotify",
      },
      {
        transaction_id: "txn_007",
        name: "Whole Foods",
        amount: 45.67,
        date: "2025-05-10",
        category: ["Groceries"],
        merchant_name: "Whole Foods",
      },
    ];
  }
  let hasMore = true;
  const transactions: any = [];
  let cursor: string | null = null;

  try {
    while (hasMore) {
      const response = await plaidClient.transactionsSync({
        access_token: accessToken,
        cursor: cursor ?? undefined,
      });

      const data = response.data;

      const newTransactions =
        data.added?.map((transaction) => ({
          id: transaction.transaction_id,
          name: transaction.name,
          paymentChannel: transaction.payment_channel,
          type: transaction.payment_channel,
          accountId: transaction.account_id,
          amount: transaction.amount,
          pending: transaction.pending,
          category: transaction.category ? transaction.category[0] : "",
          date: transaction.date,
          image: transaction.logo_url,
        })) || [];

      transactions.push(...newTransactions);

      cursor = data.next_cursor;
      hasMore = data.has_more;
    }

    return transactions;
  } catch (error) {
    console.error("An error occurred while getting the transactions:", error);
    return [];
  }
};
