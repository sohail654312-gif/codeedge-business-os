import "server-only";

import type {
  AIModelProvider,
  AIProviderInput,
  AIProviderMessage,
  AIToolCall,
} from "./provider";
import { sha256Json } from "./integrity";

function latestUser(messages: AIProviderMessage[]) {
  return [...messages].reverse().find((message) => message.role === "user")?.content ?? "";
}

function toolMessagesSinceLastUser(messages: AIProviderMessage[]) {
  const lastUserIndex = messages.map((message) => message.role).lastIndexOf("user");
  return messages.slice(lastUserIndex + 1).filter((message) => message.role === "tool");
}

function parseToolContent(message: AIProviderMessage | undefined) {
  if (!message) return null;
  try {
    return JSON.parse(message.content) as unknown;
  } catch {
    return null;
  }
}

function toolCall(name: string, args: unknown): AIToolCall {
  return {
    id:"demo-"+name+"-"+sha256Json(args).slice(0,12),
    name,
    arguments:args,
  };
}

function extractAmount(text: string) {
  const match = text.match(/(?:GBP|PKR|USD|EUR|£|\$)?\s*(\d{1,12}(?:\.\d{1,2})?)/i);
  return match?.[1] ?? "500.00";
}

function extractDate(text: string) {
  const date=text.match(/\b\d{4}-\d{2}-\d{2}\b/)?.[0];
  return date ? date+"T23:59:59Z" : null;
}

function compactJson(value: unknown) {
  const raw = JSON.stringify(value);
  return raw.length > 1800 ? raw.slice(0,1800)+"…" : raw;
}

export const demoAIProvider: AIModelProvider = {
  id:"demo_ai",
  model:"codeedge-demo-accountant-v1",

  async generate(input: AIProviderInput) {
    const user = latestUser(input.messages);
    const normalized = user.toLowerCase();
    const toolMessages = toolMessagesSinceLastUser(input.messages);

    if (toolMessages.length) {
      const proposal = toolMessages.find((message) =>
        message.name?.startsWith("propose_")
      );
      if (proposal) {
        const result = parseToolContent(proposal) as {
          proposal?: { id?: string; summary?: string };
        } | null;
        return {
          text:result?.proposal?.summary
            ? "I prepared a financial action proposal only. "+result.proposal.summary+
              " Review the exact action card and approve it before Codeedge Finance executes anything."
            : "I prepared a proposal for review. No Finance write has executed.",
          toolCalls:[],
          provider:"demo_ai",
          model:"codeedge-demo-accountant-v1",
        };
      }

      if (normalized.includes("create") && normalized.includes("invoice")) {
        const customerMessage = toolMessages.find((message) => message.name === "list_customers");
        const customers = parseToolContent(customerMessage) as {
          customers?: Array<{ crmCustomerId?: string | null; name?: string }>;
        } | null;
        const customer = customers?.customers?.find((item) => item.crmCustomerId);
        if (!customer?.crmCustomerId) {
          return {
            text:"I cannot prepare the invoice because no mapped Codeedge CRM Customer is available.",
            toolCalls:[],
            provider:"demo_ai",
            model:"codeedge-demo-accountant-v1",
          };
        }
        return {
          text:"",
          toolCalls:[toolCall("propose_invoice",{
            crmCustomerId:customer.crmCustomerId,
            currency:input.defaultCurrency,
            amount:extractAmount(user),
            dueAt:extractDate(user),
          })],
          provider:"demo_ai",
          model:"codeedge-demo-accountant-v1",
        };
      }

      const facts = toolMessages.map((message) => ({
        source:message.name,
        data:parseToolContent(message),
      }));
      return {
        text:"Based only on the Codeedge Finance tools used for this request: "+compactJson(facts),
        toolCalls:[],
        provider:"demo_ai",
        model:"codeedge-demo-accountant-v1",
      };
    }

    let calls: AIToolCall[];
    if (normalized.includes("create") && normalized.includes("invoice")) {
      calls=[toolCall("list_customers",{})];
    } else if (normalized.includes("profit") || normalized.includes("p&l")) {
      calls=[toolCall("profit_and_loss",{})];
    } else if (normalized.includes("cash flow")) {
      calls=[toolCall("cash_flow",{})];
    } else if (normalized.includes("expense")) {
      calls=[toolCall("list_expenses",{})];
    } else if (normalized.includes("bill")) {
      calls=[toolCall("list_bills",{})];
    } else if (
      normalized.includes("outstanding")
      || normalized.includes("overdue")
      || normalized.includes("unpaid")
    ) {
      calls=[toolCall("money_dashboard",{}),toolCall("list_invoices",{})];
    } else if (
      normalized.includes("summary")
      || normalized.includes("financial")
      || normalized.includes("today")
    ) {
      calls=[toolCall("money_dashboard",{}),toolCall("profit_and_loss",{})];
    } else {
      calls=[toolCall("finance_status",{}),toolCall("money_dashboard",{})];
    }

    return {
      text:"",
      toolCalls:calls,
      provider:"demo_ai",
      model:"codeedge-demo-accountant-v1",
    };
  },
};
