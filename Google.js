function maskClouds(image) {
  
  // Bits 3 and 5 are cloud shadow and cloud, respectively.
    var cloudShadowBitMask = ee.Number(2).pow(3).int();
    var cloudsBitMask = ee.Number(2).pow(5).int();  
    
    var qa = image.select('pixel_qa');
    
     // Both flags should be set to zero, indicating clear conditions.
    var mask = qa.bitwiseAnd(cloudShadowBitMask).eq(0)
    .and(qa.bitwiseAnd(cloudsBitMask).eq(0)); 
    
      // Return the masked image, scaled to [0, 1].
  return image.updateMask(mask).divide(10000).copyProperties(image, ["system:time_start"]);
}
      //  ......................indices......................

var indices = function(img) {
  // NDVI
  var ndvi = img.normalizedDifference(['B5','B4']).rename('NDVI');
  var ndbi = img.normalizedDifference(['B6', 'B5']).rename(['ndbi']);
  var ndwi = img.normalizedDifference(['B3', 'B5']);
  

  return img.addBands(ndvi).addBands(ndbi)

}
       

// ............................................................................

var l8 =ee.ImageCollection("LANDSAT/LC08/C01/T1_SR")
.filterBounds(region)
.filterDate("2014-01-01", "2016-03-30")
.filterMetadata("CLOUD_COVER", "less_than", 10)
// .select('B[2-8]')
.map(maskClouds)
.map(indices)
.mean();
print(l8)

// NDBI

var ndbi = l8.select('ndbi');
var ndbi = ndbi.gt(.1).and(ndbi.lt(.3));

var ndbiVis = {min:.1, max:.3, palette: ['white', 'red']}

// NDVI

var NDVIMask = l8.select('NDVI').gt(0.275);
var ndviVis = {min:.275, max:1, palette: ['black', 'green']}



//Select bands and parameters for visualization


var nat = {bands:['B5','B6','B4'], min:.05 , max: 0.275}; 
//Add layer to map

Map.addLayer(l8.clip(region), compvis , 'natural ');
Map.addLayer(ndbi.clip(region), ndbiVis, 'After masking ndbi ');
Map.addLayer(NDVIMask.clip(region), ndviVis, 'After masking NDVi ');


        // lets start training/////////////////////////
var classes = forest.merge(grassland).merge(crops).merge(others);

var bands = ['B5','B6','B4','ndbi'];

var image = l8.select(bands);
//Assemble samples for the model
var samples = image.sampleRegions({
  collection: classes, // Set of geometries selected for training
  properties: ['lc'], // Label from each geometry
  scale: 30 
  }).randomColumn('random'); // creates a column with random numbers
  

var split = 0.8; // Roughly 80% for training, 20% for testing.
var training = samples.filter(ee.Filter.lt('random', split)); //Subset training data
var testing = samples.filter(ee.Filter.gte('random', split)); //Subset testing data

//Print these variables to see how much training and testing data you are using
  // print('Samples n =', samples.aggregate_count('.all'));
  // print('Training n =', training.aggregate_count('.all'));
  // print('Testing n =', testing.aggregate_count('.all'));
  
  var classifier = ee.Classifier.smileRandomForest(5).train({ 
  features: training.select(['B5','B6','B4','B3','ndbi','lc']), //Train using bands and landcover property
  classProperty: 'lc', //Pull the landcover property from classes
  inputProperties: bands
  });

  
print(classifier.explain())  ;

  var validation = testing.classify(classifier);
  var testAccuracy = validation.errorMatrix('lc', 'classification');
  print('Validation error matrix RF: ', testAccuracy);
  print('Validation overall accuracy RF: ', testAccuracy.accuracy());

var classed = image.select(bands) // select the predictors
                    .classify(classifier);
                    
//Add classification to map
Map.addLayer (classed.clip(region), {min: 0, max: 4,
palette:['green','yellow','red','blue']}, 'classified')


// Model Tuning......................

var numT = ee.List.sequence(3, 50, 2);

var acc = numT.map(function(x) {
var classifier = ee.Classifier.smileRandomForest(x)
    .train({
      features: training,
      classProperty: 'lc',
      inputProperties: bands
    });

return testing
  .classify(classifier)
  .errorMatrix('lc', 'classification')
  .accuracy();
});
var kappa = testAccuracy.kappa();
print('KappaRF:', kappa);
var chart = ui.Chart.array.values({
array: ee.Array(acc),
axis: 0,
xLabels: numT
})
;
print(chart)



Export.image.toDrive({
    image: classed,
    description: 'lulc_belgium',
    scale: 30,
    region: region
  });


