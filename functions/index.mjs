function randomlyThrowError() {
  const randomNumber = Math.random();
  const errorThreshold = 0.5;

  if (randomNumber > errorThreshold) {
    console.log("Error occured in handler function.");
    throw new Error("Random error occurred!");
  } else {
    console.log("No error occurred.");
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function handler(data, context) {
  console.log("Hello world: ", JSON.stringify({...data, ...context}, 2));

  randomlyThrowError();
  sleep(2000).then((r)=> randomlyThrowError());

  return {
    message: "hello event service",
  };
}
