const {offData} = input.config();

const formatter = (data) => {
    let raw = data;
    data = JSON.parse(data);
    let sourceData = JSON.stringify(data.sources_fields);
    let keywords = data._keywords;
    
    // remove prefix and avoid null or undefined values
    let allergens =
        data.allergens_tags
        && data.allergens_tags.length
        && data.allergens_tags
            .map(tag => tag.replace('en:','').toUpperCase());
    
    /* Both names are needed because they often have different but
    but relevant information. Filter null or undefined array values */
    let names = [data.product_name_en_imported, data.product_name_en].filter(x => x);
    
    let company = data.brand_owner;
    
    /* Always return an array in case there are multiple values, but
    without any null or undefined values */
    let brands =
        Array.isArray(data.brands)
            ? data.brands
            : [data.brands].filter(x => x)

    // prefer localized serving size but avoid null or undefined values
    let serving = data.serving_size_imported || data.serving_size;

    // get images
    let images = {
        main: data.image_url,
        front: data.image_front_url,
        nutrition: data.image_nutrition_url,
        ingredients: data.image_ingredients_url,
        updated: data.last_image_t
    };

    /* get ingredients list both with & without allegen markup, if available
    prefering the localized version */
    let ingredients;
    if (data.ingredients_text_en) {
        ingredients = Object.assign({}, {text: data.ingredients_text_en})
    } else if (data.ingredients_text) {
        ingredients = Object.assign({}, {text: data.ingredients_text})
    };
    if (data.ingredients_text_with_allergens_en) {
        ingredients = Object.assign(
            ingredients ? ingredients : {},
            {markdown: data.ingredients_text_with_allergens_en}
        );
    } else if (data.ingredients_text_with_allergens) {
        ingredients = Object.assign(
            ingredients ? ingredients : {},
            {markdown: data.ingredients_text_with_allergens}
        );
    };

    // nutrient properties are null if unavailable for consistent output
    let nutrition = data.nutriments || {};
    let nutrients = {
        calcium: nutrition["calcium_100g"],
        carbs: nutrition["carbohydrates_100g"],
        cholesterol: nutrition["cholesterol_100g"],
        energy: nutrition["energy-kcal_100g"],
        fat: nutrition["fat_100g"],
        potassium: nutrition["potassium_100g"],
        proteins: nutrition["protein_100g"],
        salt: nutrition["salt_100g"],
        sodium: nutrition["sodium_100g"],
        sugars: nutrition["sugars_100g"],
        satFat: nutrition["saturated-fat_100g"],
        transfat: nutrition["trans-fat_100g"],
        vitaminA: nutrition["vitamin-a_100g"],
        vitaminB: nutrition["vitamin-b_100g"],
        vitaminC: nutrition["vitamin-c_100g"],
    };
    
    // don't include duplicate entries in gallery
    images.gallery = Array.from(new Set([
        ...Object.keys(images)
            .map(key => images[key])
            .filter(val => typeof val === 'string')
    ]));
    
    return {
        images, serving, nutrients, ingredients, allergens,
        raw, keywords, brands, company, names, sourceData
    }
};
if (offData !== "product not found"){
    let {nutrients: nu, images: im, ingredients: i, ...props} = formatter(offData);
    for (let nutri in nu) output.set(`nutri_${nutri}`, nu[nutri]||'0');
    for (let image in im) output.set(`image_${image}`, im[image]||'');
    if (i) for (let ing in i) output.set(`ingredient_${ing}`, i[ing]);
    Object.keys(props).forEach( key => props[key] && output.set(key, props[key]) )
} else {
    output.set("name", "No Product Found");
    output.set('brands', "No Product Found");
}