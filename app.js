const express = require("express");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const path = require("path");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const databasePath = path.join(__dirname, "twitterClone.db");

const app = express();

app.use(express.json());

let database = null;

const initializeDbAndServer = async () => {
  try {
    database = await open({
      filename: databasePath,
      driver: sqlite3.Database,
    });

    app.listen(3001, () =>
      console.log("Server Running at http://localhost:3001/")
    );
  } catch (error) {
    console.log(`DB Error: ${error.message}`);
    process.exit(1);
  }
};

initializeDbAndServer();

const convertUsersDbObjectToResponseObject = (dbObject) => {
  return {
    tweetId: dbObject.tweet_id,
    tweet: dbObject.tweet,
    userId: dbObject.user_id,
    dateTime: dbObject.date_time,
  };
};

app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;
  const hashedPassword = await bcrypt.hash(password, 10);
  const getUserQuery = `
    SELECT
      *
    FROM
      User
    WHERE 
       username = '${username}';`;

  const dbUserName = await database.get(getUserQuery);

  if (dbUserName === undefined) {
    if (`${password}`.length < 6) {
      response.status(400);
      response.send("Password is too short");
    } else {
      const createUser = `
        INSERT INTO 
            user
            (username, password, name, gender)
        VALUES
            ('${username}', '${hashedPassword}', '${name}', '${gender}');`;
      await database.run(createUser);
      response.status(200);
      response.send("User created successfully");
    }
  } else {
    response.status(400);
    response.send("User already exists");
  }
});

function authenticateToken(request, response, next) {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(
      jwtToken,
      "ak2284ns8Di32edmddmckdjdndmksnldkf",
      async (error, payload) => {
        if (error) {
          response.status(401);
          response.send("Invalid JWT Token");
        } else {
          request.username = payload.username;
          next();
        }
      }
    );
  }
}

app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}';`;
  const databaseUser = await database.get(selectUserQuery);
  if (databaseUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatched = await bcrypt.compare(
      password,
      databaseUser.password
    );
    if (isPasswordMatched === true) {
      const payload = {
        username: username,
      };
      const jwtToken = jwt.sign(payload, "ak2284ns8Di32edmddmckdjdndmksnldkf");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

// API 3

const userTweetsDbToResponse = (dbTweet) => {
  return {
    username: dbTweet.username,
    tweet: dbTweet.tweet,
    dateTime: dbTweet.date_time,
  };
};
app.get("/user/tweets/feed/", authenticateToken, async (request, response) => {
  const { username } = request;
  const userDetails = `SELECT user_id FROM user WHERE user.username = '${username}';`;

  const userId = await database.get(userDetails);
  const { user_id } = userId;

  const getUsersTweetQuery = `
  SELECT 
    user.username, tweet.tweet, tweet.date_time 
  FROM
    follower
  INNER JOIN tweet
    ON follower.following_user_id = tweet.user_id
  INNER JOIN user
    ON tweet.user_id = user.user_id
  WHERE 
    follower.follower_user_id = ${user_id}
  ORDER BY 
    tweet.date_time DESC
  LIMIT 4;`;

  const usersArray = await database.all(getUsersTweetQuery);

  response.send(
    usersArray.map((eachTweet) => userTweetsDbToResponse(eachTweet))
  );
});

// API 4

const userFollowerDbToResponse = (dbFollow) => {
  return {
    username: dbFollow.username,
  };
};

app.get("/user/following/", authenticateToken, async (request, response) => {
  const tweetsQuery = `
   SELECT
        DISTINCT(t2.username)
    FROM 
        (user
    INNER JOIN 
        follower
    ON 
        user.user_id = follower.follower_user_id) AS t1
    INNER JOIN 
        user AS t2  
    ON 
        t1.following_user_id = t2.user_id;`;

  const usersArray = await database.all(tweetsQuery);

  response.send(
    usersArray.map((eachFollowing) => userFollowerDbToResponse(eachFollowing))
  );
});

// API 5

app.get("/user/followers/", authenticateToken, async (request, response) => {
  const getUsersTweetQuery = `
    SELECT
      DISTINCT(username)
    FROM
      user JOIN Follower
      ON user.user_id = Follower.follower_user_id;`;

  const usersArray = await database.all(getUsersTweetQuery);

  response.send(
    usersArray.map((eachFollower) => userFollowerDbToResponse(eachFollower))
  );
});

// API 6

const convertDbToResponseTweet = (tweetDetails) => {
  return {
    tweet: tweetDetails.tweet,
    likes: tweetDetails.likes,
    replies: tweetDetails.replies,
    dateTime: tweetDetails.date_time,
  };
};

app.get("/tweets/:tweetId/", authenticateToken, async (request, response) => {
  const { tweetId } = request.params;
  const getTweetQuery = `
    SELECT
        tweet,
        COUNT(*) AS likes,
        COUNT(*) AS replies,
        date_time
    FROM 
        (user
    INNER JOIN 
        follower 
    ON 
        user.user_id = follower.follower_user_id) AS T
    INNER JOIN 
        tweet 
    ON 
        follower.following_user_id = tweet.user_id
    INNER JOIN 
        like
    ON
        tweet.tweet_id = like.tweet_id
    INNER JOIN 
        reply
    ON
        tweet.tweet_id = reply.tweet_id
    GROUP BY 
        like.like_id,
        reply.reply_id;`;
  const tweetDetails = await database.get(getTweetQuery);
  response.send(convertDbToResponseTweet(tweetDetails));
});

// API 7

const LikeDbObjectToResponse = (likeList) => {
  return {
    likes: likeList,
  };
};

app.get(
  "/tweets/:tweetId/likes/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const likedUserQuery = `
        SELECT 
            username
        FROM
            (tweet JOIN like
                ON tweet.tweet_id = like.tweet_id) AS T JOIN user
                ON T.user_id = user.user_id
        WHERE
          tweet.tweet_id = ${tweetId};`;
    const noOfLikes = await database.all(likedUserQuery);
    if (noOfLikes === undefined) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      response.send(LikeDbObjectToResponse(noOfLikes));
    }
  }
);

// API 8

const convertDbRepliesToResponseReplies = (repliesList) => {
  return {
    replies: repliesList.map((eachReply) => {
      return {
        name: eachReply.username,
        reply: eachReply.reply,
      };
    }),
  };
};

app.get(
  "/tweets/:tweetId/replies/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const tweetRepliesQuery = `
        SELECT
            user.username,
            reply.reply 
        FROM 
            (tweet INNER JOIN reply
            ON tweet.tweet_id = reply.tweet_id) AS T INNER JOIN user
            ON T.user_id = user.user_id
        WHERE 
        tweet.tweet_id = ${tweetId};`;
    const repliesList = await database.all(tweetRepliesQuery);
    if (repliesList === undefined) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      response.send(convertDbRepliesToResponseReplies(repliesList));
    }
  }
);

//API 9

const convertTweetDbObjectTOResponseObject = (dbObject) => {
  return {
    tweet: dbObject.tweet,
    likes: dbObject.likes,
    replies: dbObject.replies,
    dateTime: dbObject.date_time,
  };
};

app.get("/user/tweets/", authenticateToken, async (request, response) => {
  const tweetsQuery = `
    SELECT
        tweet,
        COUNT(*) AS likes,
        COUNT(*) AS replies,
        tweet.date_time AS dateTime
    FROM 
        (user
    INNER JOIN 
        tweet
    ON 
        user.user_id = tweet.user_id) AS T
    INNER JOIN 
        like
    ON 
        T.user_id = like.user_id
    INNER JOIN
            reply
    ON
         T.user_id = reply.user_id             
    GROUP BY 
        like.like_id,
        reply.reply_id;`;

  const tweetArray = await database.all(tweetsQuery);
  if (tweetArray === undefined) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    response.send(
      tweetArray.map((eachTweet) =>
        convertTweetDbObjectTOResponseObject(eachTweet)
      )
    );
  }
});

//API 10

app.post("/user/tweets/", authenticateToken, async (request, response) => {
  const { tweet } = request.body;

  const createTweetQuery = `
        INSERT INTO
            tweet
            (tweet)
        VALUES('${tweet}');`;
  await database.run(createTweetQuery);
  response.send("Created a Tweet");
});

// API 11
app.delete(
  "/tweets/:tweetId/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;

    const geTweetQuery = `
        DELETE
        FROM
             tweet
        WHERE
            tweet.tweet_id = ${tweetId};`;
    const deletedTweetId = await database.run(geTweetQuery);
    if (deletedTweetId === undefined) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      response.send("Tweet Removed");
    }
  }
);

module.exports = app;
