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

export async function handler(data) {
  console.log("Hello world: ", JSON.stringify(data, 2));

  randomlyThrowError();

  return {
    message: "hello event service",
  };
}
