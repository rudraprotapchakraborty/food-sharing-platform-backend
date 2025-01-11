const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB connection string from environment variables
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.y7jbt.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient instance
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect to MongoDB
    // await client.connect();
    console.log('Successfully connected to MongoDB!');

    const db = client.db("foodSharing");
    const foodsCollection = db.collection("foods");
    const requestedFoodsCollection = db.collection("requestedFoods");
    const addedFoodsCollection = db.collection("addedFoods");

    // Fetch all foods
    app.get('/foods', async (req, res) => {
      try {
        const foods = await foodsCollection.find().toArray();
        res.status(200).send(foods);
      } catch (error) {
        console.error("Error fetching foods:", error);
        res.status(500).send({ error: error.message });
      }
    });

    // Fetch a single food item by ID
    app.get('/foods/:id', async (req, res) => {
      const id = req.params.id;
      try {
        const food = await foodsCollection.findOne({ _id: new ObjectId(id) });
        if (!food) {
          return res.status(404).send({ success: false, message: "Food not found" });
        }
        res.status(200).send(food);
      } catch (error) {
        console.error("Error fetching food:", error);
        res.status(500).send({ error: error.message });
      }
    });

    app.get('/addedFoods', async (req, res) => {
      const email = req.query.email;
      const query = { "donator.email": email };
      const result = await addedFoodsCollection.find(query).toArray();
      res.send(result);
    });


    //add food to user's addedFoods collection
    app.post('/addedFoods', async (req, res) => {
      const { food_name, food_image_url, food_quantity, pickup_location, expiry_date_time, additional_notes, food_status, donator } = req.body;

      // Basic validation for required fields
      if (!food_name || !food_image_url || !food_quantity || !pickup_location || !expiry_date_time || !donator) {
        return res.status(400).send({ success: false, message: "All fields are required" });
      }

      try {
        const newFood = {
          food_name,
          food_image_url, // Save image URL
          food_quantity,
          pickup_location,
          expiry_date_time,
          additional_notes,
          food_status: food_status || 'available', // Default to "available"
          donator,
        };

        const result = await addedFoodsCollection.insertOne(newFood);

        if (result.acknowledged) {
          res.status(201).send({ success: true, message: "Food added successfully!" });
        } else {
          res.status(500).send({ success: false, message: "Failed to add food" });
        }
      } catch (error) {
        console.error("Error adding food:", error);
        res.status(500).send({ success: false, message: "Failed to add food", error: error.message });
      }
    });

    // Update food details (e.g., status, quantity) [PUT /addedFoods?email=email&foodId=foodId]
    app.put('/addedFoods', async (req, res) => {
      const { email, foodId } = req.query;
      const updateData = req.body;

      if (!email || !foodId) {
        return res.status(400).send({ success: false, message: "Email and foodId are required" });
      }

      try {
        // Ensure that the food exists for the given donator (email) and foodId
        const food = await addedFoodsCollection.findOne({
          "donator.email": email,
          "_id": new ObjectId(foodId),
        });

        if (!food) {
          return res.status(404).send({ success: false, message: "Food not found" });
        }

        // Update only the fields provided in the request body
        const result = await addedFoodsCollection.updateOne(
          { "donator.email": email, "_id": new ObjectId(foodId) },
          { $set: updateData }
        );

        if (result.matchedCount === 0) {
          return res.status(404).send({ success: false, message: "Food not found or no updates" });
        }

        res.status(200).send({ success: true, message: "Food updated successfully" });
      } catch (error) {
        console.error("Error updating food:", error);
        res.status(500).send({ error: error.message });
      }
    });


    // DELETE specific food from addedFoods collection by email and foodId [DELETE /addedFoods?email=email&foodId=foodId]
    app.delete('/addedFoods', async (req, res) => {
      const { email, foodId } = req.query;

      if (!email || !foodId) {
        return res.status(400).send({ success: false, message: "Email and foodId are required" });
      }

      try {
        const result = await addedFoodsCollection.deleteOne({
          "donator.email": email, // Ensure the email matches the donator's email
          "_id": new ObjectId(foodId), // Ensure the food ID matches
        });

        if (result.deletedCount === 0) {
          return res.status(404).send({ success: false, message: "Food not found or not authorized to delete" });
        }

        res.status(200).send({ success: true, message: "Food deleted successfully" });
      } catch (error) {
        console.error("Error deleting food:", error);
        res.status(500).send({ error: error.message });
      }
    });

    // Add a new food item
    app.post('/foods', async (req, res) => {
      const { food_name, food_image_url, food_quantity, pickup_location, expiry_date_time, additional_notes, food_status, donator } = req.body;

      // Basic validation for required fields
      if (!food_name || !food_image_url || !food_quantity || !pickup_location || !expiry_date_time || !donator) {
        return res.status(400).send({ success: false, message: "All fields are required" });
      }

      try {
        const newFood = {
          food_name,
          food_image_url, // Save image URL
          food_quantity,
          pickup_location,
          expiry_date_time,
          additional_notes,
          food_status: food_status || 'available', // Default to "available"
          donator,
        };

        const result = await foodsCollection.insertOne(newFood);

        if (result.acknowledged) {
          res.status(201).send({ success: true, message: "Food added successfully!" });
        } else {
          res.status(500).send({ success: false, message: "Failed to add food" });
        }
      } catch (error) {
        console.error("Error adding food:", error);
        res.status(500).send({ success: false, message: "Failed to add food", error: error.message });
      }
    });

    // Request a food item and add it to the requestedFoods collection
    app.post('/foods/request/:id', async (req, res) => {
      const foodId = req.params.id;
      const requestData = req.body;

      try {
        // Ensure food is available before requesting
        const food = await foodsCollection.findOne({ _id: new ObjectId(foodId) });
        if (!food) {
          return res.status(404).send({ success: false, message: "Food not found" });
        }

        if (food.food_status !== "available") {
          return res.status(400).send({ success: false, message: "Food is not available for request" });
        }

        // Update food status to "requested"
        const foodUpdateResult = await foodsCollection.updateOne(
          { _id: new ObjectId(foodId) },
          { $set: { food_status: "requested" } }
        );

        if (foodUpdateResult.modifiedCount === 0) {
          return res.status(400).send({ success: false, message: "Food not found or already requested." });
        }

        // Add request details to requestedFoods collection
        const requestedFoodResult = await requestedFoodsCollection.insertOne(requestData);

        res.status(201).send({
          success: true,
          message: "Food successfully requested!",
          data: requestedFoodResult,
        });
      } catch (error) {
        console.error("Error requesting food:", error);
        res.status(500).send({ success: false, error: error.message });
      }
    });

    // Get all requested foods
    app.get('/requestedFoods', async (req, res) => {
      try {
        const requestedFoods = await requestedFoodsCollection.find().toArray();
        res.status(200).send(requestedFoods);
      } catch (error) {
        console.error("Error fetching requested foods:", error);
        res.status(500).send({ error: error.message });
      }
    });

  } finally {
    // Ensures that the client will close when the application terminates
    // await client.close();
  }
}

// Start the server and handle errors
run().catch(console.error);

// Default route
app.get('/', (req, res) => {
  res.send('Food Sharing Website server is running!');
});

// Start the server
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});