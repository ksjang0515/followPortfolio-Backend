This is for a quick demo and is not fit for commercial use.

There are ton of ways that could cause bug and it is not efficient.

Also it would make more sense to put uid on headers andd add access token and restriction.

Some endpoint is not included in description below, since it will not be used in prototype

TODO
1. RecommendUser
2. Fix decimal precision bugs



User Endpoints
=========

## Test Users Endpoint Connection

Used for testing connection to users endpoint
> GET /users/

**Parameters:** NONE

**Response:**
|Name|Type|Description|
|:---|:---|:---|
|msg|String|"User Base Domain"|

```javascript
{
  msg: "User Base Domain"
}
```

<br>

## Following List

Get list of users user is following

> GET /users/FollowingList

**Parameters:**
|Name|Type|Description|
|:---|:---|:---|
|uid|String|Uid of user|

**Response:**
|Name|Type|Description|
|:---|:---|:---|
|followingList|Array|Array of object containing uid|
|- uid|String|Uid of following user|
|- nickname|String||
|- description|String||
|- portfolio|Array||
|- totalFollower|Number||
|- totalSubscriber|Number||
|- portfolioRatio|Array||
|- syncPeriod|Number||
|- totalBalance|Number||
|- rateOfReturn|Number||

```javascript
{
  followingList: [
    {}
  ]
}
```

<br>

## Get Sync Period

Get sync period of user

> GET /users/SyncPeriod

**Parameters:**
|Name|Type|Description|
|:---|:---|:---|
|uid|String|Uid of user|

**Response:**
|Name|Type|Description|
|:---|:---|:---|
|syncPeriod|Number|Sync period of user|

```javascript
{
  syncPeriod:
}
```

<br>

## Get Description

Get description of user

> GET /users/Description

**Parameters:**
|Name|Type|Description|
|:---|:---|:---|
|uid|String|Uid of user|

**Response:**
|Name|Type|Description|
|:---|:---|:---|
|description|String|Desctiption of user|

```javascript
{
  description:
}
```

<br>

## Get List of Following Stocks

Get list of stocks that user is following

> GET /users/FollowingListStock

**Parameters:**
|Name|Type|Description|
|:---|:---|:---|
|uid|String|Uid of user|

**Response:**
|Name|Type|Description|
|:---|:---|:---|
|followingStock|Array|Array of object containing ticker and name|
|- ticker|String|Ticker symbol of stock|
|- name|String|Name of stock|
|- dailyProfit|String||

```javascript
{
  followingStock: [
    {
      ticker: ,
      name: 
    }
  ]
}
```

<br>

## Get User Recommendations

Get list of recommended users

> GET /users/RecommendUser

**Parameters:**
|Name|Type|Description|
|:---|:---|:---|
|type|String|Select recommendation base<br>Should be one of "follower", "profit", "balance"|

**Response:**
|Name|Type|Description|
|:---|:---|:---|
|recommendation|Array|Array of object containing user info|
|- uid|String|Uid of user|
|- nickname|String|Nickname of user|
|- description|String|Description of user|
|- portfolio|Array|Array of object containing stocks owned by user|
|--- ticker|||
|--- name|||
|--- qty|||
|--- estimatedValue|||
|--- rateOfReturn|||
|- rateOfReturn|String|Rate of return of user's portfolio|
|- totalFollower|Number|Number of followers|
|- totalSubscriber|Number|Number of subscribers|

```javascript
{
  uid: ,
  nickname: ,
  description: ,
  portfolio: [
    {
      ticker: ,
      name: ,
      qty: ,
      estimatedValue: ,
      rateOfReturn: ,
    },
  ],
  rateOfReturn: ,
  totalFollower: ,
}
```

<br>

## Get User Information

Get 

> GET /users/UserInfo

**Parameters:**
|Name|Type|Description|
|:---|:---|:---|
|uid|String|Uid of user|

**Response:**
|Name|Type|Description|
|:---|:---|:---|
|uid|String|Uid of user|
|nickname|String|Nickname of user|
|description|String|Description of user|
|portfolio|Array|Array of object containing stocks owned by user|
|- ticker|String||
|- name|String||
|- qty|Number||
|- estimatedValue|Number||
|- rateOfReturn|String||
|totalFollower|Number|Number of followers|
|totalSubscriber|Number|Number of subscribers|
|portfolioRatio|Array||
|- identifier|String|Either ticker or uid depending on ratioType|
|- ratio|String||
|- ratioType|String|"stock" or "subscription"|
|totalBalance|Number|Total estimated value of user's portfolio<br>(subscription included)|
|rateOfReturn|String|Rate of return of user's portfolio|

```javascript
{
  uid: ,
  nickname: ,
  description: ,
  portfolio: [
    {
      ticker: ,
      name: ,
      qty: ,
      estimatedValue: ,
      rateOfReturn: ,
    },
  ],
  totalFollower: ,
  totalSubscriber: ,
  portfolioRatio: [
    {
      identifier: ,
      ratio: ,
      ratioType: ,
    }
  ]
  rateOfReturn: ,
  followerNum: ,
}
```

<br>

## Get User is Following Target User

Get whether user is following target user

> GET /users/isFollowing

**Parameters:**
|Name|Type|Description|
|:---|:---|:---|
|uid|String|Uid of user|
|targetUid|String|Uid of target user|

**Response:**
|Name|Type|Description|
|:---|:---|:---|
|isFollowing|Boolean||

```javascript
{
  isFollowing: true,
}
```

<br>

## Change Sync Period of User

Change Sync Period of User

> POST /users/ChangeSyncPeriod

**Parameters:**
|Name|Type|Description|
|:---|:---|:---|
|uid|String|Uid of user|
|newPeriod|Number|New period to set|

**Response:**
|Name|Type|Description|
|:---|:---|:---|
|msg|String|"Successfully updated syncPeriod"|

```javascript
{
  msg: "Successfully updated syncPeriod",
}
```

<br>

## Change Description of User

Change Description of User

> POST /users/ChangeDescription

**Parameters:**
|Name|Type|Description|
|:---|:---|:---|
|uid|String|Uid of user|
|newDescription|String|New description to set|

**Response:**
|Name|Type|Description|
|:---|:---|:---|
|msg|String|"Successfully updated description"|

```javascript
{
  msg: "Successfully updated description",
}
```

<br>

## Toggle Following

Change whether user is following another target user

> POST /users/ToggleFollowing

**Parameters:**
|Name|Type|Description|
|:---|:---|:---|
|uid|String|Uid of user|
|targetUid|String|Uid of target user|

**Response:**
|Name|Type|Description|
|:---|:---|:---|
|msg|String|"Followed User" or "Unfollowed User"|

```javascript
{
  msg: "Followed User",
}
```

<br>

## Toggle Following Stock

Change whether user is following stock

> POST /users/ToggleFollowingStock

**Parameters:**
|Name|Type|Description|
|:---|:---|:---|
|uid|String|Uid of user|
|ticker|String|Ticker symbol of stock|

**Response:**
|Name|Type|Description|
|:---|:---|:---|
|msg|String|"Followed Stock" or "Unfollowed Stock"|

```javascript
{
  msg: "Followed Stock",
}
```

Stock Endpoints
=========

## Test Stocks Endpoint Connection

Used for testing connection to stocks endpoint

> GET /stocks/

**Parameters:** None

**Response:**
|Name|Type|Description|
|:---|:---|:---|
|msg|String|"Stock Base Domain"|

```javascript
{
  msg: "Stock Base Domain",
}
```

<br>

## Search Stock

Returns 10 similar stocks based on passed name

> GET /stocks/SearchStock

**Parameters:**
|Name|Type|Description|
|:---|:---|:---|
|uid|String|Uid of User|
|name|String|Name or ticker of stock|

**Response:**
|Name|Type|Description|
|:---|:---|:---|
|stocks|Array|Array of objects containing ticker and name<br>Contains 10 objects|
|- ticker|String|Ticker symbol of stock|
|- name|String|Name of stock|
|- dailyProfit|String||

```javascript
{
  stocks: [
    {
      ticker: ,
      name: ,
    },
  ],
}
```

<br>

## Get Portfolio of User

Returns portfolio of given user

> GET /stocks/Portfolio

**Parameters:**
|Name|Type|Description|
|:---|:---|:---|
|uid|String|Uid of user|

**Response:**
|Name|Type|Description|
|:---|:---|:---|
|portfolio|Array|Array of objects containing name, ratio, and rateOfReturn|
|- name|String|Name of asset<br>(asset could be either stock or subscription)|
|- ratio|String|Ratio of asset in portfolio|
|- rateOfReturn|String|Rate of return of asset|
|totalBalance|Number|Total estimated value of user's portfolio|
|rateOfReturn|String|Rate of return of user's portfolio|

```javascript
{
  portfolio: [
    {
      name: ,
      ratio: ,
      rateOfReturn: ,
    },
  ],
  totalBalance: ,
  rateOfReturn: ,
}
```

<br>

## Get Whether User is Subscribed to Target User

Returns whether user is subscribed to target user

> GET /stocks/IsSubscribed

**Parameters:**
|Name|Type|Description|
|:---|:---|:---|
|uid|String|Uid of user|
|targetUid|String|Uid of target user|

**Response:**
|Name|Type|Description|
|:---|:---|:---|
|isSubscribed|Boolean||

```javascript
{
  isSubscribed: true,
}
```

<br>

## Sync Portfolio to Ratio

Redistrict stock / subscription to given ratio or pervious ratio

> POST /stocks/SyncPortfolio

**Parameters:**
|Name|Type|Description|
|:---|:---|:---|
|uid|String|Uid of user|
|newPortfolioRatio|Array|Array of objects containing identifier, ratio, and ratioType<br>This parameter is not mandatory and will be used previous ratio when empty|
|- identifier|String|Ticker symbol or uid of ratio<br>Depends on ratioType|
|- ratio|String||
|- ratioType|String|"stock" or "subscription"|

**Response:** None

```
{

}
```