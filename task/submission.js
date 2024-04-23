const { namespaceWrapper } = require('../_koiiNode/koiiNode');
class Submission {
  /**
   * Executes your task, optionally storing the result.
   *
   * @param {number} round - The current round number
   * @returns {void}
   */
  async task(round) {
    try {
      console.log('ROUND', round);
    const metadata = await this.loadMetadata();
    const { images, labels } = await this.loadImages(metadata);

    const baseModel = await mobilenet.load();
    const model = this.modifyModelForTransferLearning(baseModel);
    await this.trainModel(model, images, labels);
    const evaluation = await model.evaluate(images, labels);
    const accuracy = evaluation[1].dataSync()[0]; // Assuming accuracy is the second metric
    console.log('Model Accuracy:', accuracy);

    // Serialize the model to a JSON string
    const modelJson = model.toJSON();
    const modelAsString = JSON.stringify(modelJson);

    // Store or handle the model JSON and accuracy
    await namespaceWrapper.storeSet('model_json', modelAsString);
    await namespaceWrapper.storeSet('model_accuracy', accuracy.toString());

    // Optionally return a JSON string containing the model and accuracy
    return JSON.stringify({ modelJson: modelAsString, accuracy });

    } catch (err) {
      console.log('ERROR IN EXECUTING TASK', err);
      return 'ERROR IN EXECUTING TASK' + err;
    }
  }
    


  async loadMetadata() {
    const metadataUrl = 'https://github.com/eviangel/koii_task_test/tree/main/dataset/metadata.csv';
    const response = await fetch(metadataUrl);
    const text = await response.text();
    return text.split('\n').slice(1).map(line => {
      const [lesion_id, image_id, dx, dx_type, age, sex, localization] = line.split(',');
      return { lesion_id, image_id, dx, dx_type, age, sex, localization };
    });
  }


  async loadImages(metadata) {
    const images = [];
    const labels = [];

    for (const { image_id, dx } of metadata) {
      const imageUrl = `https://github.com/eviangel/koii_task_test/tree/main/dataset/${image_id}.jpg`;
      const imageResponse = await fetch(imageUrl);
      const imageBuffer = await imageResponse.buffer();
      const tensorImage = tf.node.decodeImage(imageBuffer, 3)
        .resizeNearestNeighbor([224, 224])
        .toFloat()
        .div(tf.scalar(255))
        .expandDims();
      images.push(tensorImage);
      labels.push(dx === 'bkl' ? 1 : 0); // Example for binary classification
    }

    return {
      images: tf.stack(images),
      labels: tf.tensor1d(labels, 'int32')
    };
  }

  modifyModelForTransferLearning(baseModel) {
    const model = tf.sequential();
    for (const layer of baseModel.layers) {
      model.add(layer);
      if (layer.name === 'conv_pw_13_relu') break; // Stop at the last layer of feature extraction
    }

    // Freeze the layers from the original MobileNet model
    model.layers.forEach(layer => layer.trainable = false);

    // Add new, trainable layers
    model.add(tf.layers.globalAveragePooling2d());
    model.add(tf.layers.dense({ units: 2, activation: 'softmax' })); // Change units for more classes

    model.compile({
      optimizer: tf.train.adam(),
      loss: 'sparseCategoricalCrossentropy',
      metrics: ['accuracy']
    });

    return model;
  }

  async trainModel(model, images, labels) {
    return model.fit(images, labels, {
      epochs: 10,
      batchSize: 32
    });
  }







  
  /**
   * Submits a task for a given round
   *
   * @param {number} round - The current round number
   * @returns {Promise<any>} The submission value that you will use in audit. Ex. cid of the IPFS file
   */
  async submitTask(round) {
    console.log('SUBMIT TASK CALLED ROUND NUMBER', round);
    try {
      console.log('SUBMIT TASK SLOT',await namespaceWrapper.getSlot());
      const submission = await this.fetchSubmission(round);
      console.log('SUBMISSION', submission);
      await namespaceWrapper.checkSubmissionAndUpdateRound(
        submission,
        round,
      );
      console.log('SUBMISSION CHECKED AND ROUND UPDATED');
      return submission;
    } catch (error) {
      console.log('ERROR IN SUBMISSION', error);
    }
  }
  /**
   * Fetches the submission value 
   *
   * @param {number} round - The current round number
   * @returns {Promise<string>} The submission value that you will use in audit. It can be the real value, cid, etc. 
   *                            
   */
  async fetchSubmission(round) {
    console.log('FETCH SUBMISSION');
    // Fetch the value from NeDB
    const value = await namespaceWrapper.storeGet('value'); // retrieves the value
    // Return cid/value, etc.
    return value;
  }
}
const submission = new Submission();
module.exports = { submission };
