"use strict";

const admin = require("firebase-admin");
const { Messaging } = require('firebase-admin/messaging');

module.exports = {
    /*
    * Send a message to a device(s) or a topic.
    * @param {Object} entry - of type: see the attributes in schema ../server/content-types/fcm-notification/schema.json
    * @returns {Promise<any>}
    * */
    send: async (entry) => {
        console.log('send to FCM', entry);
        let payload = {
            notification: {
              title: entry.title
            }
        };
        if (entry.body) {
            payload.notification.body = entry.body;
        }
        if (entry.image) {
            payload.notification.imageUrl = entry.image;
        }

        if (entry.payload) {
          try {
            let jsonPayload = JSON.parse(entry.payload);
            payload = { ...payload, ...jsonPayload };
          } catch {
            console.log("parsing failed so sending without payload")
          }
        }

        let options = {
          mutableContent: true
        }

        // console.log('payload', payload, 'target is ', entry.target);
        let res = null;
        if (entry.targetType === 'tokens') {
            const tokens = entry.target.split(',');
            if (tokens.length > 1) {
                res = await admin.messaging().sendMulticast({ tokens }, payload, options);
            } else {
              // Migrate legacy api to v1 api (Firebase)
              // res = await admin.messaging().sendToDevice(entry.target, payload, options);
              try {
                await admin.messaging().send({
                  notification: {
                    title: entry.title,
                    body: entry.body,
                    imageUrl: entry.image
                  },
                  apns: {
                    headers: {
                      "apns-priority": "10"
                    },
                    payload: {
                      aps: {
                        sound: "default",
                      },
                    }
                  },
                  android: {
                    priority: "high",
                  },
                  data: entry.payload.data,
                  token: entry.target,
                });
              } catch (error) {
                console.error(`Error sending message to token: ${entry.target}`, error);
              }
            }
        } else {
            const topics = entry.target.split(',');
            if (topics.length > 1) {
                res = await admin.messaging().sendToCondition(
                    topics.map(t => `'${t}' in topics`).join(' || '),
                    payload,
                    options
                );
            } else {
                res = await admin.messaging().sendToTopic(entry.target, payload, options);
            }
        }
        console.log('send to FCM res', JSON.stringify(res));
        return res;
    },
    /*
    * Initialize or reinitialize the firebase app
    * */
    initialize: async (strapi) => {
        // console.log('initialize FCM');
        const data = await strapi.db.query('plugin::strapi-plugin-fcm.fcm-plugin-configuration').findOne({
            select: ['serviceAccount']
        });
        // console.log('serviceAccount', serviceAccount);
        // console.log('admin.apps?.length', admin.apps?.length);
        if (data !== null && data.serviceAccount) {
            if (admin.apps?.length > 1) {
                Promise.all(admin.apps.map(app => app.delete())).then(() => {
                    admin.initializeApp({
                        credential: admin.credential.cert(data.serviceAccount)
                    });
                });
            } else {
                admin.initializeApp({
                    credential: admin.credential.cert(data.serviceAccount),
                });
            }
        }
    }
}
