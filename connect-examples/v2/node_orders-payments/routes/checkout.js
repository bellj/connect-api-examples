/*
Copyright 2019 Square Inc.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

const express = require("express");
const { randomBytes } = require("crypto");
const router = express.Router();

const { config, locationInstance, orderInstance, paymentInstance } = require("../util/square-connect-client");
const PickUpTimes = require("../models/pickup-times");
const OrderInfo = require("../models/order-info");
const LocationInfo = require("../models/location-info");

/**
 * Matches: POST /process-payments/
 *
 * Description:
 *  Recieves post request with a CatalogItem id. Then, retrieves location
 *  information along with the CatalogItem using retrieveCatalogObject.
 *
 *  You learn more about the RetrieveCatalogObject endpoint here:
 *  https://developer.squareup.com/docs/api/connect/v2#endpoint-catalog-retrievecatalogobject
 *
 *  NOTE: The RetrieveCatalogObject api always returns related objects, while the SDK
 *  needs "includeRelatedObjects" to be set tot true.
 *
 * Request Body:
 *  object_id: Id of the CatalogItem which will be purchased
 */

router.post("/create-order", async (req, res, next) => {
  const { item_var_id, item_quantity, location_id } = req.body;
  try {
    const { order } = await orderInstance.createOrder(
      location_id,
      {
        idempotency_key: randomBytes(45).toString("hex"), // Unique identifier for request
        order: {
          line_items: [
            {
              quantity: item_quantity,
              catalog_object_id: item_var_id // Id for CatalogItemVariation object
            }
          ]
        }
      });

    // const { location } = await locationInstance.retrieveLocation(location_id);
    // const location_info = new LocationInfo(location);

    // const order_info = new OrderInfo(order);
    // res.render("checkout/choose-delivery-pickup", {
    //   location_info,
    //   pick_up_times: new PickUpTimes(),
    //   order_info
    // });
    res.redirect(`/checkout/choose-delivery-pickup?order_id=${order.id}&location_id=${location_id}`);
  }
  catch (error) {
    next(error);
  }
});

router.get("/choose-delivery-pickup", async (req, res, next) => {
  const { order_id, location_id } = req.query;
  try {
    const { orders } = await orderInstance.batchRetrieveOrders(location_id, { order_ids: [order_id] });
    const order_info = new OrderInfo(orders[0]);

    const { location } = await locationInstance.retrieveLocation(location_id);
    const location_info = new LocationInfo(location);

    res.render("checkout/choose-delivery-pickup", {
      location_info,
      pick_up_times: new PickUpTimes(),
      order_info
    });
  }
  catch (error) {
    next(error);
  }
});

router.post("/choose-delivery-pickup", async (req, res, next) => {
  const { order_id, location_id, pickup_name, pickup_email, pickup_number, pickup_time, fulfillment_type } = req.body;
  try {
    const { orders } = await orderInstance.batchRetrieveOrders(location_id, { order_ids: [order_id] });
    const order = orders[0];

    await orderInstance.updateOrder(order.location_id, order.id, {
      order: {
        fulfillments: [
          {
            // replace fulfillment if the order is updated again, otherwise add a new fulfillment details.
            uid: order.fulfillments && order.fulfillments[0] ? order.fulfillments[0].uid : undefined,
            type: fulfillment_type,
            state: "PROPOSED",
            pickup_details: {
              recipient: {
                display_name: pickup_name,
                phone_number: pickup_number,
                email: pickup_email
              },
              pickup_at: pickup_time
            }
          }
        ],
        version: order.version,
        idempotency_key: randomBytes(45).toString("hex")
      }
    });
    res.redirect(`/checkout/payment?order_id=${order.id}&location_id=${order.location_id}`);
  }
  catch (error) {
    next(error);
  }
});

router.get("/payment", async (req, res, next) => {
  const { order_id, location_id } = req.query;
  try {
    const { orders } = await orderInstance.batchRetrieveOrders(location_id, { order_ids: [order_id] });
    const order_info = new OrderInfo(orders[0]);
    if (!order_info.hasFulfillments) {
      res.redirect(`/checkout/choose-delivery-pickup?order_id=${order_id}&location_id=${location_id}`);
    }

    const { location } = await locationInstance.retrieveLocation(location_id);
    const location_info = new LocationInfo(location);

    res.render("checkout/payment", {
      application_id: config.squareApplicationId,
      order_info,
      location_info
    });
  }
  catch (error) {
    next(error);
  }
});

router.post("/payment", async (req, res, next) => {
  const { order_id, location_id, nonce } = req.body;
  try {
    const { orders } = await orderInstance.batchRetrieveOrders(location_id, { order_ids: [order_id] });
    const order = orders[0];
    await paymentInstance.createPayment(
      {
        source_id: nonce, // Card nonce created by the payment form
        idempotency_key: randomBytes(45).toString("hex").slice(0, 45), // Unique identifier for request that is under 46 characters
        amount_money: order.total_money, // Provides total amount of money and currency to charge for the order.
        order_id: order.id // Order that is associated with the payment
      });
    res.redirect(`/order-status?order_id=${order.id}&location_id=${order.location_id}`);
  }
  catch (error) {
    next(error);
  }
});

module.exports = router;
