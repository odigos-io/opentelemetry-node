const { PubSub } = require('@google-cloud/pubsub');

async function main() {
  const topicName = process.env.DEMO_TOPIC || 'demo-topic';
  const subName = process.env.DEMO_SUBSCRIPTION || 'demo-sub';

  const pubsub = new PubSub({ projectId: process.env.GCLOUD_PROJECT || 'demo-project' });

  const [topics] = await pubsub.getTopics();
  let topic = topics.find(t => t.name.endsWith(`/topics/${topicName}`));
  if (!topic) {
    topic = await pubsub.createTopic(topicName).then(r => r[0]);
    console.log('Created topic', topicName);
  } else {
    console.log('Topic exists', topicName);
  }

  const [subs] = await pubsub.getSubscriptions();
  let sub = subs.find(s => s.name.endsWith(`/subscriptions/${subName}`));
  if (!sub) {
    sub = await topic.createSubscription(subName).then(r => r[0]);
    console.log('Created subscription', subName);
  } else {
    console.log('Subscription exists', subName);
  }
}

main().catch((e) => {
  console.error('setup failed', e);
  process.exitCode = 1;
});

