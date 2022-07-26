"use strict"
//to-do: implement user-configured table/view/field mappings
const unbalancedLedgerEntries = base.getTable("Old Ledger").getView("Unbalanced");
const unbalancedStatementItems = base.getTable("Accounts").getView("Unbalanced");

async function*batchPut(table, creates){
    if (!Array.isArray(creates)) throw new TypeError(
        "Records must be an array. To create single records, use createRecordAsync()"
    );
    while (creates.length > 0) {
        let part = creates.splice(0, 50);
        yield table.createRecordsAsync(part)
        .then(
            confirms => confirms.map( v => `${v}` ),
            error => { throw new EvalError(`Unable to create records \n\n ${error}`) }
        ).finally( ()=>
            output.text(`${part.length} created in ${table.name}, ${creates.length} remaining`)
        )
    } return
};

class AccountTx {
    /* Map account names as found in the statement to account names as found in the ledger.
    Actual values have been redacted.*/
    #accountMap = new Map()
        .set("####", "Checking")
        .set("####", "Wife Checking")
        .set("####", "Wife Credit 1")
        .set("####", "Wife Credit 2")
        .set("####", "Credit 1")
        .set("####", "Credit 2")
        .set("####", "Emergency Credit")
        .set("####", "Paypal")
    #accountName;
    #id;
    #dateString;
    #rawVal;
    payType;
    date;
    account;
    total;
    displayText;

    constructor(accountEntry){
            //internal properties
        this.#id = accountEntry.id;
        this.#dateString = accountEntry.getCellValue("Date");
        this.#rawVal = accountEntry.getCellValue("Amount");
        this.#accountName = accountEntry.getCellValue("Account").name;
        this.total = Math.round(this.#rawVal*100);
        this.payType = accountEntry.getCellValue("Type").name;
            //external properties
        this.date = Date.parse(this.#dateString)
        this.account = this.#accountMap.get(this.#accountName);
        this.displayText = this.payType === "Debit"
            ?   `${this.#dateString}`.padEnd(15, ".") + ('$(' + `${this.#rawVal}` + `)`).padStart(10, ".").padEnd(20, ".") + `${this.account}`
            :   `${this.#dateString}`.padEnd(15, ".") + ('$ ' + `${this.#rawVal}` + ` `).padStart(11, ".").padEnd(20, ".") + `${this.account}`;
    }

    get record(){
        return {id: this.#id}
    }

    findLedgerEntryIndexes(ledgerItemArray = [], offsetByNumberOfDays = 0) {
        let matches = [];
        let candidatesInRange =
            ledgerItemArray.filter( item =>
                Math.abs(item.date - this.date) <= offsetByNumberOfDays*86400000
                && item.account === this.account
            )
        ;
        //output.markdown(`### ${candidatesInRange.length} candidates in range`);
        /* Only match exact totals, and test for split tag to avoid unneccessary collision
        where a single candidate is returned as both a 'split match' and a 'pure match'. */
        let pureMatches =
            candidatesInRange.filter( candidate =>
                !candidate.hasSplitTag &&
                candidate.total === this.total
            )
        ;
        /*this could be cleaner if LedgerItem extends Object, inheriting Object.values()*/
        let splitMatches = candidatesInRange
            .reduce( (uniqueSplits, candidate) =>{
                let splitParts = candidate.getSplitParts(candidatesInRange);
                let isDuplicate = uniqueSplits
                    .some( array => 
                        array.every( (element, index) =>
                            element.payType === splitParts[index]?.payType
                            && element.description === splitParts[index]?.description
                            && element.time === splitParts[index]?.time
                            && element.total === splitParts[index]?.total
                            && element.account === splitParts[index]?.account
                        )
                    );
                    if (!isDuplicate) uniqueSplits = [...uniqueSplits, splitParts];
                    return uniqueSplits
                }, Array()
                )
            .filter( array =>{
                if (array.length === 0) return false;

                let sumTotal = array.reduce((sum, entry) => sum + entry.total, 0);
                if (this.total === sumTotal) return true;
            });
        //output.inspect([...pureMatches, ...splitMatches]);
        if( pureMatches.length > 1 && pureMatches.every( (item, _i, matchList) =>
            item.total === matchList[0].total
            && item.account === matchList[0].account
            && item.payee === matchList[0].payee
            && item.description === matchList[0].description
        )){ //console.warn(`Duplicate SINGULAR matches - selecting first copy...`, pureMatches[0]);
            pureMatches = [pureMatches[0]];
        }
        if( splitMatches.length > 0){
            //console.error(`SPLIT MATCH NEEDS VERIFICATION!`);
            if(splitMatches.length > 1 && splitMatches.every( arr =>
                arr.every( (item, _i, matchList)=>
                    item.total === matchList[0].total
                    && item.account === matchList[0].account
                    && item.payee === matchList[0].payee
                    && item.description === matchList[0].description
                )
            )){ //console.warn(`Duplicate SPLIT matches - Selecting first copy:`, splitMatches[0] );
                splitMatches = [splitMatches[0]];
            }
            //output.inspect(splitMatches);
        }
        if( pureMatches.length + splitMatches.length === 1 ){
            matches = pureMatches.length? pureMatches : splitMatches[0];
            //console.info("Match!", matches)
        } /* else if( pureMatches.length + splitMatches.length > 1 ){
            console.error("Collision!", ...pureMatches, ...splitMatches)
        } else console.log("No match found...")
         */
        return matches;
    }
}

class LedgerItem {
    #id;
    #datetimeString;
    #tags;
    #rawVal;
    payType;
    description;
    payee;
    time;
    date;
    account;
    hasSplitTag;
    total;
    displayText;
    
    constructor(ledgerTableRecord){
            //internal properties
        this.#id = ledgerTableRecord.id;
        this.#datetimeString = ledgerTableRecord.getCellValue("date");
        this.#tags = ledgerTableRecord.getCellValue("tags")?.map(tag => tag.name) ?? [];
        this.#rawVal = ledgerTableRecord.getCellValue("amount");
            //external properties
        this.payType = ledgerTableRecord.getCellValue("type").name;
        this.description = ledgerTableRecord.getCellValue("note")?.name;
        this.payee = ledgerTableRecord.getCellValue("payee")?.name;
        this.time = Date.parse(this.#datetimeString);
        this.date = Date.parse(this.#datetimeString.substr(0, 10));
        this.account = ledgerTableRecord.getCellValue("account").name;
        this.hasSplitTag = this.#tags.includes("Child of Split Record");
        this.total = Math.round(this.#rawVal*100);
        this.displayText =
        /*test*/this.payType === "Expenses"
        /*true*/?   `${this.#datetimeString}`.substr(0,16).replace(/T/, " ").padEnd(20, ".") + ('$(' + `${this.#rawVal}` + `)`).padStart(10, ".").padEnd(20, ".") + `${this.account}`
        /*else*/:   `${this.#datetimeString}`.substr(0,16).replace(/T/, " ").padEnd(20, ".") + ('$ ' + `${this.#rawVal}` + ` `).padStart(11, ".").padEnd(20, ".") + `${this.account}`;    }
    
    get record(){
        return {id: this.#id}
    }

    getSplitParts(ledgerItems) {
        if(!this.hasSplitTag) return [];
        else if(
            Array.isArray(ledgerItems)
            && ledgerItems.every( element => element instanceof LedgerItem )
        ) return ledgerItems.filter( entry =>
            entry.hasSplitTag
            && this.payType === entry.payType
            && entry.account === this.account
            && Math.abs(entry.time - this.time) <= 60000
        );
        else throw new TypeError("'ledgerItems' must be of type 'Array<LedgerItem>'")
    }
}

let balance = async function balance(maxDayOffset){
    const balanced = [];
    let ledger =
        await unbalancedLedgerEntries
        .selectRecordsAsync({
            fields: ["account", "amount", "date", "tags", "envelope_id", "note", "payee", "type"],
            sorts: [ {field: "date", direction: "asc"} ]
        })
        .then( queryResult =>
            queryResult.records
            .map( record => new LedgerItem(record) )
            .filter( record => record.account !== "Cash")
        )
    ;
    let lastLedgerDate = ledger.reduce( (last, rec) => (rec.time > last) ? rec.time : last, 0);
    let txList =
        await unbalancedStatementItems
        .selectRecordsAsync({
            fields: ["Account", "Date", "Amount", "Description", "Type"],
            sorts: [ {field: "Date", direction: "asc"} ]
        })
        .then( queryResult =>
            queryResult.records
            .map( record => new AccountTx(record) )
            .filter( tx => tx.date - lastLedgerDate < 86400000 )
        )
    ;
    for (let i in txList){
        let matches = txList[i].findLedgerEntryIndexes(ledger, maxDayOffset);
        if (matches.length) {
//            output.inspect(matches);
            balanced.push({ fields:{
                "ledgerItems": matches.map(match => match.record),
                "accountTx": [txList[i].record]
            }})
        }
    }
    output.text(`${balanced.length} Matches Found`);
    let putRecs = batchPut;
    for await (let result of putRecs(base.getTable("Balancer"), balanced)) {
        output.clear()
        output.text(`${result}`);
    }
};

let balanceAll = async function(){
    let x = 10;
    while(x >= 0) await balance(x--);
    while(x <= 10) await balance(++x);
}

await balanceAll();