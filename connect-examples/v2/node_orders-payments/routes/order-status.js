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

const { config, catalogInstance, locationInstance, orderInstance, paymentInstance } = require("../util/square-connect-client");
const CheckoutPageData = require("../models/checkout-page-data");
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
router.get("/", async (req, res, next) => {
  // Post request body contains id of item that is going to be purchased
  const { order_id, location_id } = req.query;
  try {
    const { orders } = await orderInstance.batchRetrieveOrders(location_id, { order_ids: [order_id] });
    const order_info = new OrderInfo(orders[0]);

    const { location } = await locationInstance.retrieveLocation(location_id);
    const location_info = new LocationInfo(location);

    res.render("order-status", {
      location_info,
      order_info
    });
  }
  catch (error){
    next(error);
  }
});

module.exports = router;
