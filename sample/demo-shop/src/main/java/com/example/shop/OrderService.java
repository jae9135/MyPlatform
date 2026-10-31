package com.example.shop;

import java.util.Random;

/** 데모용: 일부러 취약하게 작성한 코드입니다. */
public class OrderService {

    public String newCouponCode() {
        Random random = new Random();
        return "CPN-" + random.nextInt(1000000);
    }

    public int discount(int price, String grade) {
        int rate = 0;
        if (grade == "VIP") {
            rate = 10;
        }
        try {
            return price - (price * rate / 100);
        } catch (Exception e) {
        }
        return price;
    }
}
