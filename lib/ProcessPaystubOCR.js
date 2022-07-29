"use strict"
input.config
(   {title: "PROCESS", description: `Process records by Subject. \n\n *v1.0*`}   );

const months = new Map( [
    ["jan", "01"], ["feb", "02"], ["mar", "03"], ["apr", "04"], ["may", "05"], ["jun", "06"],
    ["jul", "07"], ["aug", "08"], ["sep", "09"], ["oct", "10"], ["nov", "11"], ["dec", "12"]    ]);

const inbox = base.getTable("Inbox");
const procTable = base.getTable("Processing");
const logTable = base.getTable( "tblq8L4B0xAwzTzK7"||"Logs" );
const procFields = ["Text","Labels","Logos", "Subject", "Year"];

const makeLog = async (msg = String()||"No log message was provided", lvl = String()||"Warn", ...records) =>
    records.map(async record =>
        await logTable.createRecordAsync( { "Message":msg, "LEVEL":{name: lvl}, "Processing":[{id: record.id}]} ).then(
            async result =>{ output.markdown(`**Log Created: ${result}**`); return record},
            async err =>
            {   output.markdown( `## LOG ERROR!` );
                output.markdown( `##### THIS ACTION WAS NOT LOGGED:
                [${lvl}]: ${msg} ${Array.from(record).map(rec => rec.name ?? rec).join(", ")}`)
                output.markdown(`**Details:**`);
                !err || ( console[lvl.toLowerCase()] ?? console.error )(err)
                return await input.buttonsAsync('',
                [   {label: "CANCEL", value: Promise.reject(err), variant: "default"},
                    {label: "IGNORE ERROR", value: record, variant: "danger"}    ])
            }).finally( ()=> output.markdown(`**${lvl}** _${msg}_`) )
);

const proc = (rec)=> {
    let lines = rec.getCellValueAsString("Text").trim().normalize("NFKC").replace(/\u0420/gu, "P").replace(/\u0423|\u0443/ug, "y")
    .replace(/\u041C|\u043C/ug, "M").replace(/\u0410/gu, "A").replace(/\u0417|\u0437/uig, "3").replace(/\btip\b.*/ig, "tip")
    .replace(/.*\bid\b.*/i, "order id").split(/\n/);
    let fields = {"Src": [{id: rec.id}], "Type": {name: lines.splice(lines.findIndex( str => /order id/i.test(str) ) -3, 1 )[0]} };
    let map = new Map(lines
        .splice( lines.findIndex(str => /order id/i.test(str)) -2 )
        .reduce( (out, line, i, arr) =>{
            out.push([ line.toLowerCase().replace(/\p{Sc}\p{Zs}*/u,'').trim(), arr.splice(i+1,1)?.[0]?.replace(/\p{Sc}\p{Zs}*/u,'')?.trim() ]);
            return out }, [] ));
    try{if ( ! map.get(map.get("total pay")).includes(map.get("order id")) )
            throw new EvalError("Unable to verify Order ID and Total Pay. Please delete scanned text, re-scan the image, and try again.");
        let raw = {
            .../(?<mo>\p{L}{3})(?:.*?)(?<d>\p{Nd}{1,2})(?:.*?)(?<slot>\p{Nd}+[ap]m\p{Pd}\p{Nd}+[ap]m)/iu
                .exec(map.get("window").replace(/\p{Zs}/u, ""))?.groups,
            .../(?<time>.+:.+:.+[ap])(?:m[^\p{L}]*)(?<st>[\p{L}\p{Zs}]+)/iu
                .exec(map.get("completed"))?.groups
        };
        let date = {
            month: months.get(raw.mo.toLowerCase()), day: raw.d.trim().padStart(2, "0"),
            year: rec.getCellValueAsString("Year").match(/\p{Nd}{4}/u)[0],
            time: raw.time.trim().replace(/[^\p{Nd}:ap]/igu, "").split(":").map( (v, i, z)=>
                (i === 0) ?
                    (/p/i.test(z.join())) ?
                        v.includes("12") ? "12"
                            : String(Number.parseInt(`${v.trim()}`, 10) + 12).padStart(2, "0") :
                    (/a/i.test(z.join())) ?
                        v.includes("12") ? "00"
                            : v.trim().padStart(2, "0") :
                    new EvalError("Invalid Time. Please Rescan the Image and try again or manually adjust the data.")
                : v.replace(/[ap]/ig, '')
            ).join(":")
        };
        return { id: rec.id, fields: { ...fields,
            "ID": { text: map.get("order id") }, "Cost": Number(map.get("order cost"))||0,  "Revenue": Number(map.get("total pay"))||0,
            "Pay": Number(map.get("order pay"))||0, "Pro": Number(map.get("promo pay"))||0, "Tip": Number(map.get("tip"))||0,
            "Slot": {name: raw.slot.toUpperCase().replace(/\p{Pd}/u, '-').trim()},
            "Status": {name: raw.st.trim().length === 4?"Late":raw.st.trim().length === 7 ? "On time" : "ERROR"},
            "Completed": new Date(`${date.year}-${date.month}-${date.day}T${date.time.length === 8 ? date.time : "ERROR"}`),
            } };
    }catch(error){
        throw { id: rec.id, fields: {"Queued": false, "PROC_ERR": `!ERROR! ${error}` } };
    }
}
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
//                          ----MAIN----
await input.buttonsAsync('', [
    {
        label: "Process Single", variant: "primary",
        value: async ()=> ({ records:
            [await input.recordAsync( 'Select an Item', procTable.getView("Pending"), {fields: procFields, shouldAllowCreatingRecord: false} )]
        })
    },{
        label: "Process All Pending", variant: "danger",
        value: async ()=> await procTable.getView("Pending").selectRecordsAsync
            ({sorts: [{field: "Subject"}, {field: "#", direction: "asc"}], fields: procFields})
    }
]).then( async result =>
    await result()
    .then( result => result.records.reduce(
        (results, rec)=>{
            try{results.valid.push( proc(rec) )}
            catch(error)
            { results.error.push(!!error.fields && !!error.id ? error : {id:rec.id, fields: {"Queued":false, "PROC_ERR":`!ERROR! ${error}`}}) }
            return results = {...results}
        }, {valid: [], error: []} ) )
).then(async result=>{
    await result.error.reduce( async (recordSets, rec) =>
        Array().concat(
            await recordSets,
            await procTable.updateRecordAsync(rec.id, rec.fields)
            .catch( err=>{throw new Error("Failed to record errors, processing aborted" + `${err}`)} )
            .then( ()=>output.text(`Errors occured. See Processing Table for details.`) )
        ), new Array()
    )
    return result.valid
}).then(async valid => valid.reduce( async (confirms, rec) =>
        Array().concat(
            await confirms,
            await base.getTable("Shipt Paystubs").createRecordAsync(rec.fields)
            .catch( async err=>{
                await procTable.updateRecordAsync(rec.id, {"Queued": false, "PROC_ERR": `!ERROR! ${err}` })
                .catch( err =>{throw new Error("Failed to record errors, processing aborted" + `${err}`)} )
                .then( ()=> output.text(`Errors occured. See Processing Table for details.`) )
            }).then( async ()=> await procTable.updateRecordAsync(rec.id, {"Queued": false}))
        ), new Array()
    )
)