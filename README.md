This is for a quick demo and is not fit for commercial use.

There are ton of ways that could cause bug and it is not efficient.

Also it would make more sense to put uid on headers



Endpoints
=========

## Test Users Endpoint Connection
---
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
---
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
```javascript
{
  followingList: [
    {}
  ]
}
```

<br>

## Get Sync Period
---
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
---
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
---
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
---
Get list of recommended users

> GET /users/RecommendUser

**Parameters:**
|Name|Type|Description|
|:---|:---|:---|
|type|String|Select recommendation base<br>Should be either "follower" or "profit"|

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
---
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
|- ticker|||
|- name|||
|- qty|||
|- estimatedValue|||
|- rateOfReturn|||
|totalFollower|Number|Number of followers|
|totalSubscriber|Number|Number of subscribers|
|portfolioRatio|Array||
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
  rateOfReturn: ,
  followerNum: ,
}
```

<br>

## Get Sync Period
---
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