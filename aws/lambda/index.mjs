export const handler = async (event, context) => {
  const API_TOKEN = process.env.API_TOKEN;
  const API_ENDPOINT = process.env.API_ENDPOINT;

  try {
    const response = await fetch(API_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${API_TOKEN}`,
      },
    });

    const body = await response.text();

    return {
      statusCode: 200,
      body: JSON.stringify("FireSystemProbe: success"),
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: error.toString(),
    };
  }
};
