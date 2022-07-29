//--------------------------------------------------------------------//
//----------------CUSTOM ERRORS FOR ADVANCED HANDLING-----------------//
//--------------------------------------------------------------------//
class FetchError extends Error {
    constructor(response, endpoint) {
        super(
`!ERROR - Unexpected response from ${endpoint}:
${response.status} - ${response.statusText}`
        );
    }
}
class ChecksumError extends Error {
    constructor(message, code) {
        super(message);
        this.scanned = barcodeText;
        this.codeType = barcodeType;
        this.converted = code;
    }
}
//--------------------------------------------------------------------//
//-------------------------ACTION HAPPENS HERE------------------------//
//--------------------------------------------------------------------//
//input values
let { barcodeType, barcodeText } = input.config();
// Only query for code formats we know
let {code, form} = handleCode({barcodeText, barcodeType});
if (form === 'upc') {
    console.log(form, code)
    // Perform checksum before consuming API calls to prevent waste
    if (!checksum(code)) throw new ChecksumError('Checksum Failed', code);
    // Do the thing
    await getOff(code);
}
//--------------------------------------------------------------------//
//--------------------------UTILITY FUNCTIONS-------------------------//
//--------------------------------------------------------------------//
// function to call api async
// https://openfoodfacts.github.io/api-documentation/
async function getOff(code) {
    return fetch(
    `https://world.openfoodfacts.org/api/v0/product/${code}.json`
    ).then( r => {
        if (r.ok) return r.json();
        throw new FetchError(r, 'https://world.openfoodfacts.org/api/v0/product');
    }).then( ({ status, product, status_verbose }) => 
        status !== 1 ? status_verbose : JSON.stringify(product)
    ).then(result => output.set('OpenFoodFacts', result));
}
// barcode-format specific logic
function handleCode({barcodeText, barcodeType}) {
    if (barcodeType === 'upce') {
        return {code: toUPCAfromUPCE(barcodeText), form: 'upc'};
    }
    if (barcodeType === 'upca'||'upc'||'ean') {
        return {code: barcodeText.padStart(13, '0'), form: 'upc'};
    }
    if (barcodeType === 'datamatrix') {
        return {code: barcodeText, form: 'qr'};
    }
    throw new TypeError(`
For accuracy purposes, only barcodes of a known type will be accepted.
Please reach out to support and this type of barcode will be added.
Barcode: ${barcodeText}
Type: ${barcodeType}`
    )
}
// function to convert UPC-E back to UPC-A
// see: https://stackoverflow.com/questions/31539005/how-to-convert-a-upc-e-barcode-to-a-upc-a-barcode/31539006#31539006
function toUPCAfromUPCE(upce) {
    if (typeof upce !== 'string') throw new TypeError('value of upceStr must be a string!')
    let n = upce.charAt(6)
    if (parseInt(n) < 3) return upce.slice(0,3) + n + "0000" + upce.slice(3,6) + upce.charAt(7);
    if (n==="3") return upce.slice(0,4) + "00000" + upce.slice(4,5) + upce.charAt(7);
    if (n==="4") return upce.slice(0,5) + "00000" + upce.charAt(5) + upce.charAt(7);
    if (parseInt(n) > 4) return upce.slice(0,6) + "0000" + n + upce.charAt(7);
}
// function to verify EAN / UPC checkdigit
// adapted from: https://gist.github.com/Yurko-Fedoriv/547287e3cc0f78c11354b99d72debfcf
// see also: https://desk.zoho.com/portal/chompthis/en/kb/articles/im-having-trouble-getting-matches-for-barcodes-what-can-id-do
function checksum(c) {
    let getCheckdigit = (s) => {
        let result = 0;
        let reversed = s.split('').reverse().join('');
        for (let counter = 0; counter < reversed.length; counter++) {
            result = result
                + parseInt(reversed.charAt(counter))
                * Math.pow(3, ((counter + 1) % 2));
        };
        return (10 - (result % 10)) % 10;
    };
    return c ? getCheckdigit(c.slice(0, -1)) === Number(c.slice(-1)) : false;
}