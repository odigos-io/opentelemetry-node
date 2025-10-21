const { PubSub } = require('@google-cloud/pubsub');

const pubsub = new PubSub({ projectId: process.env.GCLOUD_PROJECT || 'demo-project' });
const subscriptionName = process.env.DEMO_SUBSCRIPTION || 'demo-sub';

const subscription = pubsub.subscription(subscriptionName);

subscription.on('message', msg => {
  try {
    const data = JSON.parse(msg.data.toString());
    console.log('consumer received', data);
    msg.ack();
  } catch (e) {
    console.error('consumer error', e);
    msg.nack();
  }
});

console.log('consumer listening on subscription', subscriptionName);

