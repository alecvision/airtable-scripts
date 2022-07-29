"use strict"
/* TODO: This design uses as a hacky way of getting the script to run in the background, but ultimately such
use-cases are best served by a proper Automations workflow. It should be refactored accordingly. */

//---Configuration---//
const config = input.config({
    title: 'Split Multiple Input Fields',
    description: 'This app will split a multiple-entry field and place each resulting value in the <Output Field> of a new record in <Output Table>.',
    items: [
        input.config.table('inTable', { label: 'Inbox Table' }),
        input.config.field('inField', { parentTable: 'inTable', label: 'Source Field' }),
        input.config.field('submitTime', { parentTable: 'inTable', label: '"Created At" Date-Time Field (From Source)' }),
        input.config.field('checkBox', { parentTable: 'inTable', label: '"Queued" Checkbox Field (From Source)'}),
        input.config.table('outTable', { label: 'Output Table' }),
        input.config.field('outField', { parentTable: 'outTable', label: 'Output Field' }),
        input.config.field('src', { parentTable: 'outTable', label: 'Link-Back Field (To Source)' }),
        input.config.select('timer', {
            options: [
                { value: '600000', label: '10 Minutes' },
                { value: '900000', label: '15 Minutes' },
                { value: '1200000', label: '20 Minutes' },
                { value: '1800000', label: '30 Minutes' },
                ], label: 'Repeat Delay', description: 'The length of time Likitty will wait before checking the Source Table for new data'})
    ]
});

const runHistory = [];
const startedAt = Number(`${Date.now()}`);
var { inTable, inField, submitTime, checkBox, outTable, outField, src, timer } = config;

//---Readout---//
output.markdown(
`## Current Configuration ##`)
output.table({
    'INPUT:': {'Table': `${inTable.name}`, 'Field': `${inField.name}`},
    'OUTPUT:': {'Table': `${outTable.name}`, 'Field': `${outField.name}`}
})
output.markdown(`#### (Run Every: ` + (Number(timer).valueOf() / 60000) + ` minutes) ####`)
output.markdown(
`## \\[Logs\\] ##\n\n` + '\\>(^.^)< meow >(^.^)<');

    // Main Function //
async function $main() {
    /* Load records from the input table with only relevant fields */
    let result = await inTable.selectRecordsAsync({
        sorts: [
            { field: checkBox, direction: "desc" },
            { field: submitTime, direction: "asc" },
            ],
        fields: [ submitTime, checkBox, inField ]});

    /* Loop through the results */
    for (let record of result.records) {
        
        console.log(record) //DEBUG
        
        /* Skip if not queued */
        let queued = Boolean(record.getCellValue(checkBox))
        if ( !(queued) ) {
            continue;
        }

        /* Return cell values from input field, verbosely */
        let cellValues = record.getCellValue(inField)
        output.markdown(`##### \`Found ${cellValues.length} new records:\``)
        /* Make a counter */
        var x = 1

        /* Loop through cell values, verbosely */
        for (let item of cellValues) {
            output.text(`#${x}: ${item.id}\n${item.filename} (${item.size} bytes)`)

            /* Build a record for the item and link it to the source */
            let newRecord = {
                [src.id]: [{"id": record.id}],
                [outField.id]: [{"url": item.url}]
            }

            /* Output the above as a new record */
            await outTable.createRecordAsync(newRecord)

            /* Increment the counter */
            x ++
        }

        /* Remove the parent from the queue */
        await inTable.updateRecordAsync(record, {[checkBox.id]: false})
    }
}

output.markdown(`**Started at: ` + new Date(startedAt) + `**`);
runHistory.push(startedAt);
await $main();
while (true) {
    let delay = Number(timer)
    console.log(runHistory[-0])
    let lastRun = runHistory.pop();
    let timeNow = Number(`${Date.now()}`);
    runHistory.push(lastRun);
    if ( timeNow > lastRun + delay ) {
        output.markdown(`**` + new Date() + `**`)
        await $main();
        runHistory.push(timeNow);
    }
}