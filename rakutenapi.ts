import axios from 'axios';
import { z } from "zod";
import { tool } from "@langchain/core/tools";
import { ChatOpenAI } from "@langchain/openai";
import { CallbackHandler } from "langfuse-langchain";
import { HumanMessage } from "@langchain/core/messages";

const appId = process.env.RAKUTEN_APP_ID;

const ascAffiliateRate = '%2BaffiliateRate'; //アフィリエイト料率順（昇順）
const descAffiliateRate = '%2DdescAffiliateRate'; //アフィリエイト料率順（降順）
const ascReviewCount = '%2BreviewCount';//レビュー件数順（昇順）
const descReviewCount = '%2DreviewCount';//レビュー件数順（降順）
const ascReviewAverage = '%2BreviewAverage';//レビュー平均順（昇順）
const descReviewAverage = '%2DreviewAverage';//レビュー平均順（降順）
const ascItemPrice = '%2BitemPrice';//価格順（昇順）
const descItemPrice = '%2DitemPrice'//価格順（降順）
const ascUpdateTimestamp = '%2BupdateTimestamp';//商品更新日時順（昇順）
const descUpdateTimestamp = '%2DupdateTimestamp';//商品更新日時順（降順）
const standard = 'standard';//楽天標準ソート順

enum SortOrder {
    ascAffiliateRate = 0,
    descAffiliateRate = 1,
    ascReviewCount = 2,
    descReviewCount = 3,
    ascReviewAverage = 4,
    descReviewAverage = 5,
    ascItemPrice = 6,
    descItemPrice = 7,
    ascUpdateTimestamp = 8,
    descUpdateTimestamp = 9,
    standard = 10
}

interface ImageURL {
    imageUrl: string
}

interface ItemData {
    affiliateRate: number,
    affiliateUrl: string,
    asurakuArea: string,
    asurakuClosingTime: string,
    asurakuFlag: number,
    availability: number,
    catchcopy: string,
    creditCardFlag: number,
    endTime: string,
    genreId: string,
    giftFlag: number,
    imageFlag: number,
    itemCaption: string,
    itemCode: string,
    itemName: string,
    itemPrice: number,
    itemPriceBaseField: string,
    itemPriceMax1: number,
    itemPriceMax2: number,
    itemPriceMax3: number,
    itemPriceMin1: number,
    itemPriceMin2: number,
    itemPriceMin3: number,
    itemUrl: string,
    mediumImageUrls: ImageURL[],
    pointRate: number,
    pointRateEndTime: string,
    pointRateStartTime: string,
    postageFlag: number,
    reviewAverage: number,
    reviewCount: number,
    shipOverseasArea: string,
    shipOverseasFlag: number,
    shopAffiliateUrl: string,
    shopCode: string,
    shopName: string,
    shopOfTheYearFlag: 0,
    shopUrl: string,
    smallImageUrls: ImageURL[],
    startTime: string,
    tagIds: string,
    taxFlag: number
}

interface Item {
    Item: ItemData;
}

interface RakutenResponse {
    GenreInformation: [],
    Items: Item[],
    TagInformation: [],
    carrier: number,
    count: number,
    first: number,
    hits: number,
    last: number,
    page: number,
    pageCount: number
}

function getSortOrder(id: number) : string {
    switch(id) {
        case SortOrder.ascAffiliateRate:
            return ascAffiliateRate;
        case SortOrder.descAffiliateRate:
            return descAffiliateRate;
        case SortOrder.ascItemPrice:
            return ascItemPrice;
        case SortOrder.descItemPrice:
            return descItemPrice;
        case SortOrder.ascReviewAverage:
            return ascReviewAverage;
        case SortOrder.descReviewAverage:
            return descReviewAverage;
        case SortOrder.ascReviewCount:
            return ascReviewCount;
        case SortOrder.descReviewCount:
            return descReviewCount;
        case SortOrder.ascUpdateTimestamp:
            return ascUpdateTimestamp;
        case SortOrder.descUpdateTimestamp:
            return descUpdateTimestamp;
        case SortOrder.standard:
            return standard;
        default:
            return standard;
    }
}

async function getRakutenItem(keyword:string, sortId: number) : Promise<ItemData[]> {
    const sort = getSortOrder(sortId);
    const url = `https://app.rakuten.co.jp/services/api/IchibaItem/Search/20220601?applicationId=${appId}&keyword=${encodeURI(keyword)}&sort=${sort}`
    
    const res = await axios.get<RakutenResponse>(url);
    console.log("items count :"+res.data.Items.length);
    var items = res.data.Items;
    if(items.length > 5) {
        items = items.slice(4);
    }
    var itemDatas:any = [];
    items.forEach(item => {
        const data = {
            itemName: item.Item.itemName, 
            itemUrl: item.Item.itemUrl,
            itemCaption: item.Item.itemCaption,
        }
        itemDatas.push(data);
    });
    return itemDatas;
}

// settings ============================================================

const llm = new ChatOpenAI({
    modelName: "gpt-4o-mini",
    temperature: 0
});

const trace = new CallbackHandler({tags: ["function-calling"]});

// function calling ====================================================

const recomendSchema = z.object({
    itemName: z.string().describe("おすすめする商品の商品名"),
    itemUrl: z.string().describe("おすすめする商品のURL"),
    reason: z.string().describe("おすすめする理由"),
})
const recomendTool = tool(
    async({itemName, itemUrl, reason}) => {
        console.log(`商品名：${itemName}\nURL:${itemUrl}\nおすすめポイント：${reason}`);
    },
    {
        name: "recomend",
        description: "おすすめの商品を紹介する",
        schema: recomendSchema,
    }
)
const recomendLLM = llm.bindTools([recomendTool]);
const recomendToolsByName = {
    recomend: recomendTool
}

const searchItemSchema = z.object({
    keyword: z.string().describe("探している商品のキーワード"),
    sortOrder: z.number().min(0).max(10).describe("検索順　0: アフィリエイト料率順（昇順）, 1: アフィリエイト料率順（降順）, 2: レビュー件数順（昇順）, 3: レビュー件数順（降順）, 4: レビュー平均順（昇順）, 5: レビュー平均順（降順）, 6: 価格順（昇順）, 7: 価格順（降順）, 8: 商品更新日時順（昇順）, 9: 商品更新日時順（降順）, 10: 楽天標準ソート順"),
    sort: z.string().describe("検索順の名前")
})
const searchItemTool = tool(
    async({keyword, sortOrder, sort}) => {
        const items = await getRakutenItem(keyword, sortOrder);

        var messages = [new HumanMessage(`[${keyword}]の商品を${sort}で探しています。以下のitemsの中からおすすめの商品を教えてください。\nitems: ${JSON.stringify(items)}`)]
        
        const res = await recomendLLM.invoke(messages, {callbacks:[trace]});
        await trace.flushAsync();

        if(res.tool_calls) {
            const toolCall = res.tool_calls[0];
            const selectedTool = recomendToolsByName[toolCall.name];
            await selectedTool.invoke(toolCall, {callbacks:[trace]});
            await trace.flushAsync();
        }
    },
    {
        name: "searchItem",
        description: "商品の検索をする",
        schema: searchItemSchema,
    }
)
const searchItemLLM = llm.bindTools([searchItemTool]);
const searchItemToolsByName = {
    searchItem: searchItemTool
}

async function getRecomendItem(message) {
    const res = await searchItemLLM.invoke(message, {callbacks:[trace]});
    await trace.flushAsync();

    if(res.tool_calls) {
        for (const toolCall of res.tool_calls) {
            const selectedTool = searchItemToolsByName[toolCall.name];
            await selectedTool.invoke(toolCall, {callbacks:[trace]});
            await trace.flushAsync();
        }
    }
}

await getRecomendItem("一人暮らしの狭い部屋にも置けるおしゃれなソファを探しています。");