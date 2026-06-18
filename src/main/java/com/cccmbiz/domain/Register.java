package com.cccmbiz.domain;

import jakarta.persistence.*;
import lombok.*;

import java.sql.Timestamp;

@Entity
@Data
@NoArgsConstructor
@AllArgsConstructor
public class Register {
    @Id
    @Column(name = "id")                    private int id;
    @Column(name = "uid")                   private String uid;
    @Column(name = "household_id")          private int householdId;
    @Column(name = "event_id")              private int eventId;
    @Column(name = "profile_id")            private String profileId;
    @Column(name = "helper_user_id")        private Integer helperUserId;
    @Column(name = "created_on")            private Timestamp createdOn;
    @Column(name = "last_update")           private Timestamp lastUpdate;
    @Column(name = "status")                private byte status;
    @Column(name = "price_model")           private byte priceModel;
    @Column(name = "adult")                 private byte adult;
    @Column(name = "meal")                  private Byte meal;
    @Column(name = "stripe_customer_id")    private String stripeCustomerId;
    @Column(name = "note")                  private String note;
    @Column(name = "checkin_time")          private Timestamp checkinTime;
    @Column(name = "total_people")          private byte totalPeople;
}
